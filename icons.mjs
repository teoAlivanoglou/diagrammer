const paths = {
  brand: '<rect x="3" y="9" width="6" height="6" rx="1"/><circle cx="17.5" cy="6.5" r="3.5"/><path d="M9 12h3l3-3M12 12l4 6m-2 0h7m-7 3h7"/>',
  file: '<path d="M6 3.5h8l4 4V21H6zM14 3.5V8h4M9 12h6m-6 4h6"/>',
  edit: '<path d="m13 6 5 5M5 19l4-.8L20 7.3a2.3 2.3 0 0 0-3.3-3.3L5.8 15z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M5 15v5h14v-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  shapes: '<rect x="3.5" y="4" width="7" height="7" rx="1"/><circle cx="16.75" cy="7.5" r="3.5"/><path d="M4 16h6m-6 4h6m4-4h6l-2-2m2 2-2 2"/>',
  select: '<path d="m5 3 14 10-7 1.5L9 21z"/>',
  entity: '<rect x="3.5" y="6" width="17" height="12" rx=".25"/>',
  process: '<circle cx="12" cy="12" r="8"/>',
  store: '<path d="M3.5 7.5h17m-17 9h17"/>',
  flow: '<path d="M3.5 12h16m-5-5 5 5-5 5"/>',
  curve: '<path d="M3 16q7-12 17-4m-2-6 2 6-6 1"/>',
  text: '<path d="M5 7V5h14v2M12 5v14m-3 0h6"/>',
  undo: '<path d="M9 5 4 10l5 5m-5-5h9a6 6 0 0 1 6 6v2"/>',
  redo: '<path d="m15 5 5 5-5 5m5-5h-9a6 6 0 0 0-6 6v2"/>',
  fit: '<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  canvas: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9h17"/>',
  sliders: '<path d="M4 7h4m5 0h7M4 17h9m5 0h2"/><circle cx="10.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/>',
  reverse: '<path d="M4 8h15m-4-4 4 4-4 4m5 4H5m4-4-4 4 4 4"/>',
  trash: '<path d="M4 7h16m-10 0V4h4v3m-8 0 1 13h10l1-13m-8 3v6m4-6v6"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5m0-8v.2"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
};
export function icon(name) {
  return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
}
