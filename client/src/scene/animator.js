// Pure procedural animation: each function takes elapsed time and returns
// a delta pose (rotation offsets in radians, keyed by bone name, plus an
// optional root bob). The caller adds these deltas onto each bone's
// captured rest rotation -- these functions never touch a THREE.Object3D
// so they blend and test cleanly.

function pose(rotations, rootBobY = 0) {
  return { rotations, rootBobY }
}

export function applyIdle(elapsed) {
  return pose({
    chest: { x: Math.sin(elapsed * 2) * 0.03 },
    head: { y: Math.sin(elapsed * 0.6) * 0.18 },
  })
}

export function applyWalk(elapsed) {
  const t = elapsed * 9
  return pose({
    'upperleg.l': { x: Math.sin(t) * 0.55 },
    'upperleg.r': { x: -Math.sin(t) * 0.55 },
    'lowerleg.l': { x: Math.max(0, -Math.sin(t)) * 0.8 },
    'lowerleg.r': { x: Math.max(0, Math.sin(t)) * 0.8 },
    'upperarm.l': { x: -Math.sin(t) * 0.45 },
    'upperarm.r': { x: Math.sin(t) * 0.45 },
    spine: { x: 0.08 },
  }, Math.abs(Math.sin(t)) * 0.04)
}

export function applyWork(elapsed) {
  return pose({
    'upperarm.l': { x: -0.9 },
    'upperarm.r': { x: -0.9 },
    'lowerarm.l': { x: -0.6 + Math.sin(elapsed * 11) * 0.25 },
    'lowerarm.r': { x: -0.6 - Math.sin(elapsed * 11) * 0.25 },
    head: { x: Math.sin(elapsed * 5) * 0.05 },
  })
}

export function applyTalk(elapsed) {
  return pose({
    head: { y: Math.sin(elapsed * 3) * 0.1 },
    'upperarm.r': { x: -0.6 + Math.sin(elapsed * 4) * 0.2 },
  })
}

function lerpAxes(a = {}, b = {}, t) {
  return {
    x: (a.x || 0) + ((b.x || 0) - (a.x || 0)) * t,
    y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
    z: (a.z || 0) + ((b.z || 0) - (a.z || 0)) * t,
  }
}

// Blends two poses (e.g. idle/work vs. walk) by `t` in [0, 1].
export function blendPoses(a, b, t) {
  const boneNames = new Set([...Object.keys(a.rotations), ...Object.keys(b.rotations)])
  const rotations = {}
  for (const name of boneNames) {
    rotations[name] = lerpAxes(a.rotations[name], b.rotations[name], t)
  }
  return pose(rotations, a.rootBobY + (b.rootBobY - a.rootBobY) * t)
}

// Overlays a talk pose onto a base pose, replacing shared bone channels.
export function overlayPose(base, overlay) {
  return pose({ ...base.rotations, ...overlay.rotations }, base.rootBobY)
}
