# ci paths=src/game/,src/ui/
# Real game actions with a full backpack: each failure must preserve its inputs.
STEPS = [
  {'eval': """(() => {
    window.__packTest = {
      check(ok, message) { if (!ok) throw new Error('FAIL ' + message); },
      reset(rows) {
        const g = __game;
        g.stop(); g.closeAll();
        g.state.inv.slots.fill(null);
        for (const slot of Object.keys(g.state.equip)) g.state.equip[slot] = null;
        g.state.ammo = 0;
        for (const [id, n] of rows) g.state.inv.add(id, n);
        g.state.inv.changed();
        return g;
      }
    };
    const t = __packTest, g = t.reset([['bronze_arrow', 5], ['logs', 27]]);
    g.state.equip.ammo = 'iron_arrow'; g.state.ammo = 100;
    g.panels.actions.primary(0);
    t.check(g.state.equip.ammo === 'bronze_arrow' && g.state.ammo === 5, 'arrow swap changed arrow counts or type');
    t.check(g.state.inv.count('iron_arrow') === 100 && g.state.inv.count('logs') === 27, 'old ammunition was lost');
    return 'PASS full-pack arrow swap';
  })()"""},
  {'eval': """(() => {
    const t = __packTest, g = t.reset([['shortbow', 1], ['logs', 27]]);
    g.state.equip.weapon = 'bronze_sword'; g.state.equip.shield = 'bronze_kiteshield';
    g.panels.actions.primary(0);
    t.check(g.state.equip.weapon === 'bronze_sword' && g.state.equip.shield === 'bronze_kiteshield' && g.state.inv.count('shortbow') === 1, 'bow swap must preserve everything when two removed items cannot fit');
    g.state.inv.remove('logs', 1);
    g.panels.actions.primary(0);
    t.check(g.state.equip.weapon === 'shortbow' && !g.state.equip.shield, 'bow left a shield equipped');
    t.check(g.state.inv.count('bronze_sword') === 1 && g.state.inv.count('bronze_kiteshield') === 1, 'bow swap lost old gear');
    const shield = g.state.inv.slots.findIndex(s => s?.id === 'bronze_kiteshield');
    g.panels.actions.primary(shield);
    t.check(g.state.equip.shield === 'bronze_kiteshield' && !g.state.equip.weapon && g.state.inv.count('shortbow') === 1, 'shield swap did not return the two-handed bow');
    return 'PASS atomic two-handed equipment swaps';
  })()"""},
  {'eval': """(() => {
    const t = __packTest, g = t.reset([['arrow_shaft', 30], ['feather', 30], ['logs', 26]]);
    const xp = g.state.skills.xp.fletching;
    g.panels.actions.useOn(0, 1); g.sim(1.3);
    t.check(g.state.inv.count('arrow_shaft') === 30 && g.state.inv.count('feather') === 30 && !g.state.inv.count('headless_arrow'), 'full-pack crafting consumed materials or discarded its result');
    t.check(g.state.skills.xp.fletching === xp && !g.activity, 'failed crafting granted XP or kept running');
    g.state.inv.remove('logs', 1);
    g.panels.actions.useOn(0, 1); g.sim(1.3); g.stop();
    t.check(g.state.inv.count('headless_arrow') === 15 && g.state.inv.count('arrow_shaft') === 15 && g.state.inv.count('feather') === 15, 'crafting failed after room was made');
    t.check(g.state.skills.xp.fletching === xp + 1, 'successful crafting XP was missing or duplicated');
    return 'PASS full-pack crafting and retry';
  })()"""},
  {'eval': """(() => {
    const t = __packTest, g = t.reset([['bronze_arrow', 10], ['logs', 27]]);
    g.openShop('general');
    const row = g.currentShop.stock.find(s => s.id === 'bronze_arrow'), before = row.n;
    g.menus.qty = 1; g.panels.actions.primary(0);
    t.check(g.state.inv.count('bronze_arrow') === 10 && !g.state.inv.count('coins') && row.n === before, 'blocked sale lost goods or changed stock');
    g.menus.qty = 10; g.panels.actions.primary(0);
    t.check(!g.state.inv.count('bronze_arrow') && g.state.inv.count('coins') === 10 && row.n === before + 10, 'whole-stack sale did not use its vacated slot');
    return 'PASS full-pack sales';
  })()"""},
  {'eval': """(() => {
    const t = __packTest, g = t.reset([['coins', 12], ['logs', 27]]);
    g.openShop('inn');
    const bread = g.currentShop.stock.find(s => s.id === 'bread'), before = bread.n;
    g.menus.shop.onBuy(bread, 1);
    t.check(g.state.inv.count('bread') === 1 && !g.state.inv.count('coins') && bread.n === before - 1, 'exact-price purchase did not use the coin slot');
    t.reset([['coins', 13], ['logs', 27]]); g.openShop('inn');
    const bread2 = g.currentShop.stock.find(s => s.id === 'bread'), remaining = bread2.n;
    g.menus.shop.onBuy(bread2, 1);
    t.check(!g.state.inv.count('bread') && g.state.inv.count('coins') === 13 && bread2.n === remaining, 'blocked purchase lost money or changed stock');
    return 'PASS exact-fit and blocked purchases';
  })()"""},
]
