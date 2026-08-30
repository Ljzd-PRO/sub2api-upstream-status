# NAS SMTP Relay

## Purpose

Run a dedicated Postfix relay on the NAS so NAS applications can send mail
through an existing Office 365 SMTP account. This relay is independent of the
`sub2api-smtp-relay` container on the server.

The current server relay remains private to Sub2API: it shares Sub2API's
network namespace and listens on `localhost:25`. Do not expose or reuse it for
the NAS.

## Topology

```text
NAS application -> 127.0.0.1:587 -> NAS smtp-relay -> smtp.office365.com:587
```

The NAS binds port `587` to loopback only. No SMTP port is exposed on the LAN
or public Internet.

## Files

Create a directory such as `/volume1/docker/smtp-relay` on the NAS:

```text
/volume1/docker/smtp-relay/
  docker-compose.yml
  .env
  passwd_file
```

Set the secret-file permissions:

```bash
chmod 600 .env passwd_file
```

Do not commit `.env` or `passwd_file` to Git.

## Environment

Create `.env` with placeholders replaced by real credentials:

```dotenv
TZ=Asia/Shanghai
SMTP_RELAY_USERNAME=phycol-smtp
SMTP_RELAY_PASSWORD=REPLACE_WITH_A_RANDOM_PASSWORD

# Existing Microsoft 365 / Office 365 sending account.
OFFICE365_SMTP_USERNAME=notify@phycol.cn
OFFICE365_SMTP_PASSWORD=REPLACE_WITH_THE_OFFICE365_APP_PASSWORD
```

`SMTP_RELAY_USERNAME` and `SMTP_RELAY_PASSWORD` authenticate NAS applications
to the local relay. They are separate from the Office 365 account credentials.

Use a long random value for `SMTP_RELAY_PASSWORD`, for example:

```bash
openssl rand -hex 32
```

## Relay Authentication File

The `mwader/postfix-relay` image uses `pam_pwdfile` for incoming SMTP
authentication. The password file must contain a SHA-512 crypt hash, not the
plaintext password.

Run this in the relay directory after `.env` is in place:

```bash
set -a
. ./.env
set +a

umask 077
printf '%s:%s\n' "$SMTP_RELAY_USERNAME" \
  "$(openssl passwd -6 "$SMTP_RELAY_PASSWORD")" > passwd_file
chmod 600 passwd_file
```

Regenerate `passwd_file` whenever `SMTP_RELAY_PASSWORD` changes, then recreate
the relay container.

## Docker Compose

Create `docker-compose.yml`:

```yaml
name: nas-smtp-relay

services:
  smtp-relay:
    image: mwader/postfix-relay@sha256:e44ea5030906c054503837c49d5c3d1a310c349de96937b2bd642390a6c40d54
    container_name: nas-smtp-relay
    restart: unless-stopped
    ports:
      - "127.0.0.1:587:25"
    env_file:
      - .env
    volumes:
      - ./passwd_file:/etc/postfix/sasl/sasl_passwds:ro
      - relay-spool:/var/spool/postfix
      - relay-postfix-lib:/var/lib/postfix
      - relay-mail:/var/mail
    environment:
      - TZ=${TZ:-Asia/Shanghai}
      - SASL_Passwds=/etc/postfix/sasl/sasl_passwds
      - POSTFIX_myhostname=nas-smtp-relay.local
      - POSTFIX_inet_interfaces=all
      - POSTFIX_mydestination=localhost
      - POSTFIX_mynetworks=127.0.0.0/8
      - POSTFIX_smtpd_tls_security_level=none
      - POSTFIX_smtpd_tls_auth_only=no
      - POSTFIX_smtpd_sasl_auth_enable=yes
      - POSTFIX_cyrus_sasl_config_path=/etc/postfix/sasl
      - POSTFIX_smtpd_sasl_security_options=noanonymous
      - POSTFIX_smtpd_relay_restrictions=permit_sasl_authenticated,reject
      - POSTFIX_smtpd_recipient_restrictions=permit_sasl_authenticated,reject
      - POSTFIX_broken_sasl_auth_clients=yes
      - POSTFIX_relayhost=[smtp.office365.com]:587
      - POSTFIX_smtp_sasl_auth_enable=yes
      - POSTFIX_smtp_sasl_password_maps=hash:/etc/postfix/sasl_passwd
      - POSTFIX_smtp_sasl_security_options=noanonymous
      - POSTFIX_smtp_sasl_tls_security_options=noanonymous
      - POSTFIX_smtp_sasl_mechanism_filter=login
      - POSTFIX_smtp_tls_security_level=encrypt
      - POSTFIX_smtp_tls_CAfile=/etc/ssl/certs/ca-certificates.crt
      - POSTFIX_smtp_tls_loglevel=1
      - POSTMAP_sasl_passwd=[smtp.office365.com]:587 ${OFFICE365_SMTP_USERNAME:?OFFICE365_SMTP_USERNAME is required}:${OFFICE365_SMTP_PASSWORD:?OFFICE365_SMTP_PASSWORD is required}
      - RSYSLOG_TIMESTAMP=yes
    healthcheck:
      test: ["CMD-SHELL", "bash -ec '</dev/tcp/127.0.0.1/25'"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

volumes:
  relay-spool:
  relay-postfix-lib:
  relay-mail:
```

`POSTFIX_smtpd_relay_restrictions=permit_sasl_authenticated,reject` is
essential: unauthenticated clients must not be able to relay mail.

## Start And Verify

```bash
docker compose up -d
docker compose ps
docker compose logs -f smtp-relay
docker exec nas-smtp-relay postqueue -p
```

Expected results:

- The container becomes `healthy`.
- `postqueue -p` reports an empty queue when no mail is pending.
- Logs show successful authentication and delivery to Office 365 after a NAS
  test message is sent.

## NAS Application Settings

Configure the NAS application to use:

```text
SMTP host: 127.0.0.1
SMTP port: 587
Encryption: None
Authentication: LOGIN or PLAIN
Username: value of SMTP_RELAY_USERNAME
Password: value of SMTP_RELAY_PASSWORD
From address: notify@phycol.cn
```

The NAS-to-relay hop is loopback-only, so plaintext SMTP AUTH stays inside the
NAS. The relay-to-Office-365 hop uses STARTTLS with certificate validation.

## Operations

After changing `.env` or `passwd_file`:

```bash
docker compose up -d --force-recreate smtp-relay
docker compose ps
```

To inspect delivery failures:

```bash
docker compose logs --tail=200 smtp-relay
docker exec nas-smtp-relay postqueue -p
```

Do not publish this relay to `0.0.0.0` or a LAN address unless TLS and a source
IP allowlist are configured first.
