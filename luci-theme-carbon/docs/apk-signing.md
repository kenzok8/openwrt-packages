# Building signed APK releases

The SDK creates the APK; the release job then signs the **individual APK**, verifies it using only `keys/carbon-apk.pem`, and publishes it together with the public key, installation guide and `SHA256SUMS`. Signing only a repository index is insufficient for LuCI's local package upload.

## Maintainer setup

The production private key belongs in the repository's GitHub Actions secret **`APK_SIGNING_KEY`** (complete PEM content). It must match `keys/carbon-apk.pem`. Keep an encrypted backup outside the repository; `.private/` and `*.private.pem` are ignored as an extra precaution. Never commit the private key, print it in CI, or include it in artifacts. Ordinary builds and pull requests do not receive it. A release fails if the secret is missing or verification fails.

The existing project key is persistent: **do not generate a new key for each release**. Fork maintainers should generate their own key pair, replace the public key and its checksum, and update the installation guide's fingerprint and download URLs:

```sh
umask 077
mkdir -p .private keys
# For a NEW project/fork only. Do not overwrite an existing production key.
test ! -e .private/carbon-apk.private.pem &&
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out .private/carbon-apk.private.pem
openssl pkey -in .private/carbon-apk.private.pem -pubout -out keys/carbon-apk.pem
(cd keys && sha256sum carbon-apk.pem > SHA256SUMS)
```

Configure `APK_SIGNING_KEY` in **Settings → Secrets and variables → Actions**. With an authenticated GitHub CLI, the file can be supplied through stdin without printing it:

```sh
gh secret set APK_SIGNING_KEY < .private/carbon-apk.private.pem
```

After the secret is configured, push a version tag matching `PKG_VERSION`. The release job uses a pinned Alpine image with apk-tools 3, no container network, an ephemeral private-key file and a separate public-key trust directory. The private-key file is removed on exit. Only signed APKs enter the Release; `sdk-*` build artifacts remain unsigned development outputs. Existing published releases are not silently replaced.

## Local signing and validation

On a system with apk-tools 3:

```sh
sh scripts/sign-apk.sh .private/carbon-apk.private.pem keys/carbon-apk.pem dist/*.apk
apk --keys-dir keys verify dist/*.apk
```

The integration test needs apk-tools 3, OpenSSL and an unsigned SDK package. It creates disposable keys and checks rejection of unsigned packages, missing/mismatched keys, untrusted keys and damaged payloads, plus successful verification after signing:

```sh
sh tests/apk-signing.sh path/to/unsigned-sdk-package.apk
```

User setup: [APK installation](apk-install.md). If rotating a lost or compromised key, publish the new fingerprint and explicit import/revocation instructions; devices trusting the old key will not automatically trust the new one.
