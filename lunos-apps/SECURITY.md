# LunOS repository credential security

No personal GitHub API token is stored in this repository.

The workflow uses GitHub's automatically-created `GITHUB_TOKEN`. It is used
only inside the GitHub Actions runner and is never printed.

The verification step checks that:
- the token exists;
- the workflow is running for `LunOS-Official/lunos-apps`;
- GitHub accepts the credential;
- the repository identity matches.

Do not put a PAT, OAuth token, or other credential in LunOS JavaScript or a
public `.ln` package.

For a future external publisher-upload service, use a server-side credential
or GitHub App rather than embedding a credential in the client.
