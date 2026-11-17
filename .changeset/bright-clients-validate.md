---
'@hey-api/openapi-ts': patch
---

Validate every successful Fetch response before returning it, including empty and non-JSON responses. Preserve supported header representations during SDK default merging and validate effective headers case-insensitively without losing typed inputs or deletion markers.

Decode SSE frames independently of chunk boundaries, preserve the protocol's single-space rule, settle reader cancellation rejections, and advance reconnect cursors only after complete frames.

Related reports: #4492, #2537, #2643, #4478, #2715, #4469, #4464, and #4418. Existing EOF and retry policies remain unchanged.
