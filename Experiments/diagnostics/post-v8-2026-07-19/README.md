# Post-v8 Diagnostic Campaign Registry

- **Evidence class:** DIAGNOSTIC
- **Disposition:** RETAINED
- **Interpretation:** VERIFIED under SCI-001
- **Raw location:** `Experiments/raw-data/external-diagnostics/` (ignored, local-only)
- **Observed inventory:** 60 manifests, 804 files, 134 checksum lists
- **Integrity check:** all listed payloads passed SHA-256 verification on 1 August 2026

This registry organises the evidence boundary without promoting it. The campaign contains four
clean reproductions of the governed v8 screen, 50 dirty diagnostic runs from `b654e85`, and six
dirty 10,000-tick qualification-like runs from `cba779d`. The latter completed but produced zero
screening passes and no confirmation candidate. They are not a governed qualification.

Files in this directory:

- [`campaign-inventory.csv`](campaign-inventory.csv) records the raw campaign groups and manifest
  provenance observed locally;
- [`source-artefact-inventory.csv`](source-artefact-inventory.csv) records the unsafe helper
  scripts, external narrative, and untracked qualification inputs by exact SHA-256.

Under `SCI-001`, all 60 manifests and 1,930 payload files were verified with zero mismatches. The invalid legacy density calculations have been superseded by exposure-denominated metrics (`activations`). The sealed, deterministic audit outputs, provenance, checksums, and lead-authored summary are available at [`Experiments/processed-data/diagnostics/post-v8-2026-07-19/`](../../processed-data/diagnostics/post-v8-2026-07-19/README.md).
