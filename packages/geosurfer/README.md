# GeoSurfer

Adds an optional, lightweight video card to GeoGuessr's in-game stats panel.

The video is not embedded in the userscript. It is loaded through `@resource` from the `userscripts-assets` GitHub release, so the script stays small and the manager can cache the media. The optimized loop lives at `assets/geosurfer/brainrot.mp4`; CI uploads it as the release resource.

Settings are available in the shared **Userscripts** tab:

- Enabled
- Show overlay
- Play only while visible
- Mute playback

Playback is lazy: the video source is assigned only when the card is visible, and playback pauses when the tab or card is hidden.

## Regenerate the media

The committed loop is an 8-second, 202×360, 12 fps H.264 clip without audio.

```bash
ffmpeg -i source.mp4 -t 8 \
  -vf "scale=202:-2,fps=12" \
  -an -c:v libx264 -crf 31 -preset veryslow \
  -pix_fmt yuv420p -movflags +faststart \
  assets/geosurfer/brainrot.mp4
```

Replace `assets/geosurfer/brainrot.mp4` and let CI upload it to the `userscripts-assets` release.
