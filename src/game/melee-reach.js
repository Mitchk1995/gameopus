// A melee blow must reach the target's body in three dimensions and have a clear
// path through the world. Keep normal jump attacks and slopes forgiving: measure
// to the nearest height on the body, rather than requiring matching foot heights.
// Area attacks measure reach from their impact point but still cannot cross a wall
// between the attacker and victim.
export function meleeReach(world, from, to, range, fromHeight, toHeight, radius = 0, impact = from) {
  const y = from.y + fromHeight * 0.65;
  const targetY = Math.min(to.y + toHeight - 0.1, Math.max(to.y + 0.1, y));
  const distance = Math.max(0, Math.hypot(to.x - impact.x, to.z - impact.z) - radius);
  if (Math.hypot(distance, targetY - y) > range) return false;
  // Use the full 3D scenery sweep, which also sees roofs and floors. The ordinary
  // projectile ray only checks a shape's height where it first enters its footprint.
  return world.lineOfSight({ x: from.x, y, z: from.z }, { x: to.x, y: targetY, z: to.z }, 0.025, true, 0.025) >= 0.999;
}
