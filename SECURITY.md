# Security policy

KubeInsight is an operations console that can hold cluster credentials. Please treat
security reports accordingly.

## Reporting

Do **not** open a public issue for a vulnerability. Instead, contact the maintainers
privately (repository security advisory / maintainer email) with:

- affected version or commit;
- reproduction steps;
- impact assessment (read-only? secret disclosure? code execution?);
- any suggested mitigation.

We aim to acknowledge reports within 7 days.

## Supported versions

Only the latest `0.1.x` line receives security fixes at this stage.

## Hardening checklist for operators

- Bind to `127.0.0.1` unless you have a TLS-terminating proxy with authentication.
- Set `KUBEINSIGHT_AUTH_TOKEN` whenever the console is reachable beyond localhost.
- Prefer a dedicated ServiceAccount with the narrowest RBAC that still covers your
  workflows, rather than cluster-admin.
- Set `KUBEINSIGHT_READ_ONLY=1` for viewers; this also disables pod exec.
- Treat the kubeconfig / ServiceAccount token as a production secret; do not bake it
  into images.
- Rotate the shared token and the cluster credentials after any suspected leak.
- Review Kubernetes audit logs: all requests are made with the server's identity, so
  per-user attribution is not available without an identity-aware proxy.

See [docs/design.md](docs/design.md) for the threat model and
[deploy/README.md](deploy/README.md) for the RBAC shipped with the example manifest.
