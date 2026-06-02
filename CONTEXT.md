# Mytory Video Tools — Domain Glossary

## Video Joiner

| Term | Definition |
|---|---|
| **Video Joiner** | A tool that concatenates multiple video files into one. Designed as the final step in a partial-edit workflow: Split → Edit segment → Join. |
| **Lossless concatenation** | Combining video files by stream copy (no re-encoding) using ffmpeg's concat demuxer. Only possible when all input files have identical codec parameters. |
| **Joiner queue** | A reorderable list of video files dropped by the user, displayed with filename and technical metadata for comparison. |
| **Compatibility check** | ffprobe-based comparison of all files in the Joiner queue against a reference (first file in order). All files must match the reference's codec parameters for lossless concatenation. |
| **Joiner drop zone** | The entire tool panel area acts as a drop zone; files can be added at any time. There is no separate visual dropzone — the file list itself IS the drop target. |
| **Joiner file reordering** | Files in the Joiner queue can be reordered via drag-and-drop to control concatenation order. |
| **Joiner initial sort** | When files are first dropped, they are sorted by filename. Subsequent manual reordering is preserved; new files are appended without re-sorting. A "Sort by name" button is provided as needed. |
| **Joiner compatibility fields** | For lossless concatenation, these fields must match exactly across all files: video codec, resolution (width×height), pixel format, frame rate, audio codec, audio sample rate, audio channels. All fields are obtained via `joiner:probe` IPC handler which returns raw ffprobe data. Bitrate may differ. |
| **Joiner display fields** | Per-file row shows: filename, resolution, video codec, pixel format, frame rate, audio codec, audio sample rate, audio channels, file size, duration. |
| **Joiner queue usage** | Uses the standard task queue system. A single "Join" task is added showing overall progress across all input files. |
| **Joiner output policy** | Follows the existing save policy (same folder as source / custom folder). Output filename: `{first_filename_no_ext}_joined.mp4`. |

## Core Tool categories

| Term | Definition |
|---|---|
| **Lossless tools** | Operations that do not re-encode video/audio data: Remuxer, Splitter, Video Joiner. |
| **Transcoding tools** | Operations that re-encode video/audio data: Speed Changer, Compressor. |
