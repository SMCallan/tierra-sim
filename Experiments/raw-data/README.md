# Raw Data Boundary

Raw simulator outputs are immutable, non-overwriting evidence bundles. They remain ignored by Git
because they are large and machine-local; this README and `.gitkeep` are the only tracked files in
this directory by default.

Rules:

1. Never edit, rename, merge, or overwrite a completed run directory.
2. Verify the bundle's own checksum lists before interpretation.
3. Treat a checksum pass as file-integrity evidence, not scientific qualification.
4. Record source commit, dirty-worktree state, configuration identity, seed, and terminal reason.
5. Copy or archive raw data only through a governed process that retains path and checksum
   provenance.
6. Never assume a local ignored bundle exists in another clone.

`calibration/` contains retained governed development runs. `external-diagnostics/` contains
external-agent development work awaiting SCI-001 disposition. Formal outputs must eventually use
a separately named, protocol-frozen location.
