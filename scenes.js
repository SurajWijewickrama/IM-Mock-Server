// Single source of truth for the scenes that can be remotely loaded in Unity.
// `id` must match the SceneMapping ids in SceneSelector.cs.
// `name` must match the exact Unity scene file name (no .unity extension) and
// the scene must be added to File > Build Settings.
module.exports = [
  { id: 0, name: 'MainScene',              label: 'Main Menu' },
  { id: 1, name: 'Scene_1_Car_dealership', label: 'Car Dealership' },
  { id: 2, name: 'Scene_2_Castle',         label: 'Castle' },
  { id: 3, name: 'Scene_R1',               label: 'Scene R1' },
  { id: 4, name: 'Scene_3_farm',           label: 'Farm' },
];
