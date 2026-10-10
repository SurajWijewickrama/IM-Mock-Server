# ImmersiveSmile remote control

Static dashboard in `public/index.html` and `public/remote-controls.js`, connected to the existing ImmersiveSmile Firebase Realtime Database. Synchronized with the Unity source on 10 October 2026.

## Scene catalog

All 21 enabled scenes are available. IDs are stable remote content IDs, not Unity build indices.

| ID | Unity scene |
| --- | --- |
| 0 | `MainScene` |
| 1 | `Scene_1_Car_dealership` |
| 2 | `Scene_2_Castle` |
| 3 | `Scene_R1` |
| 4 | `Scene_3_farm` |
| 20 | `SleepingOcean` |
| 21 | `LumiStarfall` (Pearl Garden) |
| 22 | `DreamRoad` |
| 23 | `CloudVoyage` |
| 24 | `StarHeart` |
| 25 | `FastLumiValley` |
| 26 | `ImpossibleGarden` |
| 27 | `ImpossibleGarden_NoVideos` |
| 28 | `ImpossibleGarden_Mochi` |
| 29 | `ImpossibleGarden_Mochi_NoVideos` |
| 30 | `LumiValley` |
| 31 | `spaceIsland` |
| 32 | `Scene_4_Solarland` |
| 33 | `SinharajaSanctuary` |
| 34 | `Nightfall_Main` |
| 35 | `JustOneBiscuit` |

The previous ID 33 Sky Ferry entry was incorrect for the current app. Nightfall and Just One Biscuit were missing. Extra asset-pack/demo scenes without a runtime mapping and enabled build entry are not launchable experiences.

Scene selection preserves loop segments and clears the scene stop flag. Segment length applies to scenes implementing the segmented-loop interface; it does not change Nightfall's driving route. The headset must have a full APK containing the selected scene. A Nightfall-only APK cannot run the other 20 scenes.

## Staff workflow for Nightfall

1. Put on the headset and open the app. Select **Nightfall · Luxury Drive** on its dashboard card.
2. Wait for fresh Nightfall status. Choose the active controller, then enable **Allow car selection**.
3. Hold that controller in tracking view. If paused, click **Resume showcase**. Check that the headset reports selection enabled and is no longer paused.
4. In VR, point at a car or its name until the gold strip highlights, then tap the index trigger. After entering the cabin, release and press the trigger again to drive.

**STOP** pauses and revokes selection permission. Switching hand or entering Procedure mode also pauses; returning to Showcase does not automatically resume. Enable selection again and Resume when ready. A Resume rejected while the controller is untracked needs another explicit Resume after tracking returns.

**Reset to gallery** resets the session and disables selection until staff enable it again. **Finish session** invokes the app's ending. Mute applies to Nightfall audio. The selected car, scene beat, distance, active hand and pause/selection state are headset reports, not assumed command results.

Cabin controls remain in VR: trigger drives, A/X toggles engine, B/Y stops, grip controls the window, stick click controls the door, stick left/right changes lighting, and stick up/down selects D/P. Driving follows the authored route.

## Other controls

- **Stress-ball settings & input:** hand (automatic/left/right), diameter 4–10 cm, finger response range 0.06–0.30 and optional connection notice. Save is explicit. Defaults are automatic hand, 6.5 cm, 0.12 and notice off. The headset reports readiness, tracking and applied revision.
- **Send one input pulse:** sends one timestamp event to scenes using the shared remote-input source. Passive scenes may ignore it. Disabled in Nightfall, whose selection and drive use local input.
- **Presentation preview · advanced:** a five-second preview of supported visual calm, animation, audio, particle and world-focus settings. Requires fresh app telemetry; does not steer a car or move the tracked camera. Restore releases the preview. Expiry, Stop and scene changes cancel it.
- **End/Resume and loop length:** retained for the other scenes, with scene-specific behavior handled by Unity.
- **Rename:** stores a staff label separately from the headset-owned model name.

Only headset heartbeats establish connection. After 15 seconds without one, controls disable and the device moves into the offline list. Requested scene and reported scene are separate. Fresh reports are used to decide which scene's controls apply. Forms retain drafts, focus and expanded state across database refreshes.

## Firebase contract

All paths are relative to `/users/{deviceId}`. Opening the dashboard sends no control commands.

| Path | Purpose |
| --- | --- |
| `scene` | Stable ID, scene name, segments, stop, update time |
| `nightfall/control` | Selection permission, active hand, mode, mute, stop; boot-bound resume/reset/finish commands |
| `nightfall/status` | Read-only session acknowledgement and car state |
| `stressBall/control` | Schema v1 settings and unique revision |
| `stressBall/status` | Read-only input and applied-revision reports |
| `triggerAt` | Firebase server timestamp for one shared input event |
| `telemetry` | Read-only app boot, scene, sequence and adaptive acknowledgement |
| `adaptive` | Version 1 command bound to the current boot, scene and telemetry sequence; expires in five seconds |
| `label` | Staff-defined headset name |

Nightfall commands fetch current status before writing, carry a unique command ID, and expire after 15 seconds. Commands for each device are ordered; Stop cancels older queued commands. A sent command never overwrites reported headset state. Firebase multipath updates are handled in the local stream mirror. Database access rules are unchanged.

## Local use and validation

From this folder:

```sh
node tests/remote-control.test.cjs
python3 -m http.server 8080 --bind 127.0.0.1 --directory public
```

Open `http://127.0.0.1:8080`. This local dashboard connects to the configured Firebase project, so clicking an enabled control operates that headset.

The automated suite uses mocked Firebase responses: it covers all scene buttons, offline guards, session freshness, Stop ordering, settings validation, multipath updates, form retention and command errors. It does not send live Firebase commands or establish physical controller playback. The scene catalog was separately compared against Unity's `SceneSelector.cs` and enabled build settings.

Changes are local until deployed. The existing GitHub Pages workflow publishes `public/` on pushes to main/master; Firebase Hosting also points at that folder. Deploy both `index.html` and `remote-controls.js` together. The Pages workflow runs the regression suite before publishing.
