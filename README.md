# ImmersiveSmile remote scene control

Firebase-hosted dashboard in `public/index.html`. The scene catalog was synchronized on 28 September 2026 with `SceneSelector.cs` and the 19 enabled scenes in Unity `ProjectSettings/EditorBuildSettings.asset`.

| ID | Unity scene |
| --- | --- |
| 0 | `MainScene` |
| 1 | `Scene_1_Car_dealership` |
| 2 | `Scene_2_Castle` |
| 3 | `Scene_R1` |
| 4 | `Scene_3_farm` |
| 20 | `SleepingOcean` |
| 21 | `LumiStarfall` |
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
| 33 | `Scene_SkyFerry` |

IDs are stable content IDs, not Unity build indices. Lumi Starfall uses the updated Pearl Garden content while retaining ID 21. The original serialized MainScene mappings supply IDs 0–4; SceneSelector adds IDs 20–33 at startup.

Selecting a scene writes its ID/name to `/users/{userId}/scene`, retains the segment count, and sets `stop: false`. The existing End/Resume and segment controls remain available. A headset must run a build containing these mappings and scenes.

Additional asset-pack/demo/recovery scenes and scenes without an enabled build entry and remote mapping are intentionally not launch buttons. Register and enable a new Unity scene before adding its stable ID here.

Validation: catalog matched all 19 enabled Unity scenes and runtime mappings; simulated clicks on all 19 buttons verified outgoing Firebase payloads and selected-state updates. No live Firebase writes or headset playback were exercised. Changes are local until the site's normal Firebase Hosting deployment runs.

## Headset connection and scene commands

The dashboard uses `lastSeen` heartbeats written by Unity to identify active headsets. Database snapshots and dashboard scene writes do not mark a device online. Devices without a heartbeat for 15 seconds appear under the collapsed offline list, with their controls disabled. Put on the headset and open the app to reconnect. Device names and full IDs distinguish saved records for the same Quest model.

“Requested scene” means Firebase accepted the command; it is not a scene-loaded acknowledgement from Unity.

Run the dashboard regression checks with `node tests/remote-control.test.cjs`.
