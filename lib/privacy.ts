export function maskAccountName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const emailParts = trimmed.split("@");
  if (emailParts.length === 2 && emailParts[0] && emailParts[1]) {
    return `${maskSegment(emailParts[0], 2, 1)}@${maskDomain(emailParts[1])}`;
  }

  return maskSegment(trimmed, 2, 2);
}

function maskDomain(domain: string): string {
  const parts = domain.split(".");
  if (parts.length < 2) return maskSegment(domain, 2, 1);

  const tld = parts.pop();
  return `${parts.map((part) => maskSegment(part, 2, 1)).join(".")}.${tld}`;
}

function maskSegment(value: string, visibleStart: number, visibleEnd: number): string {
  if (value.length <= 1) return "*";
  if (value.length <= visibleStart + visibleEnd) {
    return `${value.slice(0, 1)}${"*".repeat(value.length - 1)}`;
  }

  const start = value.slice(0, visibleStart);
  const end = value.slice(-visibleEnd);
  return `${start}${"*".repeat(Math.max(3, value.length - visibleStart - visibleEnd))}${end}`;
}

