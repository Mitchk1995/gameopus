# ci
# Shops answer a right-click: Value, Buy 1/5/10/50 and Examine, like the pack's own menu; buying
# from the menu takes the coins and hands over that many.
STEPS = [
  {'eval': """(() => {
    const g = __game, st = g.state;
    st.inv.add('coins', 5000);
    g.openShop('general');
    const cells = [...document.querySelectorAll('.win .bankgrid .slot')];
    if (!cells.length) return 'FAIL the general store opened with no stock';
    const cell = cells[0], id = g.currentShop.stock[0].id, before = st.inv.count(id), coins = st.inv.count('coins');
    const r = cell.getBoundingClientRect();
    cell.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
    const menu = [...document.querySelectorAll('.menu')].find((m) => !m.hidden);
    if (!menu) return 'FAIL right-clicking shop stock showed no menu';
    const labels = [...menu.querySelectorAll('button')].map((b) => b.textContent);
    const buy5 = [...menu.querySelectorAll('button')].find((b) => b.textContent.startsWith('Buy 5 '));
    if (!buy5) return 'FAIL the shop menu has no "Buy 5": ' + labels.join(' | ');
    buy5.click();
    const got = st.inv.count(id) - before, paid = coins - st.inv.count('coins');
    const price = g.currentShop.stock[0].price;
    return got === 5 && paid === 5 * price && menu.hidden
      ? { labels, bought: got, paid }
      : 'FAIL Buy 5 gave ' + got + ' and took ' + paid + ' coins (price ' + price + '), menu hidden=' + menu.hidden;
  })()"""},
  {'wait': 200},
  {'shot': 'shop_menu'},
]
