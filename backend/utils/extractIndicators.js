
const URL_REGEX = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

const EMAIL_REGEX =
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

const IPV4_REGEX =
  /\b(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}\b/g;

function cleanMatch(value) {
  return value.replace(/[.,!?;:)]+$/g, "");
}

export function extractIndicators(text) {
  const urls = [...new Set(
    (text.match(URL_REGEX) || [])
      .map(cleanMatch)
      .filter(Boolean)
  )];

  const emails = [...new Set(text.match(EMAIL_REGEX) || [])];

  const ipAddresses = [...new Set(text.match(IPV4_REGEX) || [])];

  const indicators = [
    ...urls.map((value) => `URL: ${value}`),
    ...ipAddresses.map((value) => `IP: ${value}`),
    ...emails.map((value) => `Email: ${value}`),
  ];

  return {
    urls,
    ipAddresses,
    emails,
    indicators,
  };
}
