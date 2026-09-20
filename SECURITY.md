# Security

This repository is the official LunOS application package repository.

## Credentials

No GitHub personal access token, Google OAuth client secret, or Cloudflare
secret belongs in this repository.

GitHub Actions receives its short-lived workflow credential through the
`GITHUB_TOKEN` environment provided by GitHub. The verification script checks
the repository identity and never prints the token.

The LunOS Publisher Worker keeps its GitHub and Google credentials in the
server-side environment. They must not be copied into `.ln` packages,
frontend JavaScript, README files, or Git history.

## Package trust

A package can request LunOS runtime permissions. The App Store should show those
permissions and publisher metadata before installation. Review source and
permissions when the package is not from a publisher you trust.

## Reporting

Do not commit credentials or private data to this repository. Report suspected
security issues through the project's maintained security contact or GitHub
security reporting mechanisms.
