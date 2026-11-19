// Synchronous first-paint header mount for Velscour Wiki pages.
// Placed as the first tag inside <body> so the Topbar, Searchbar, and Section Tabs
// paint on Frame 1 with zero layout shift while ES game data modules load in the background.
(function () {
  if (document.querySelector('.wiki-shell-header')) return;
  var scriptEl = document.currentScript;
  var active = (scriptEl && scriptEl.getAttribute('data-wiki-active')) || 'hub';

  var sections = [
    { id: 'hub', label: 'Wiki Hub', icon: '📖', href: 'wiki.html' },
    { id: 'classes', label: 'Classes', icon: '🛡️', href: 'classes.html', count: '19' },
    { id: 'skills', label: 'Skills', icon: '⚡', href: 'skills.html', count: '684' },
    { id: 'talents', label: 'Talent Trees', icon: '🌟', href: 'talents.html', count: '456' },
    { id: 'bestiary', label: 'Bestiary', icon: '💀', href: 'bestiary.html', count: '1,090+' },
    { id: 'gear', label: 'Gear & Relics', icon: '🗡️', href: 'gear.html', count: '180+' },
    { id: 'world', label: 'World & Acts', icon: '🗺️', href: 'world.html', count: '36' },
    { id: 'lore', label: 'Lore & Folk', icon: '📜', href: 'lore.html', count: '80+' }
  ];

  var navHtml = '';
  for (var i = 0; i < sections.length; i++) {
    var s = sections[i];
    var actCls = s.id === active ? ' active' : '';
    var cnt = s.count ? '<span class="wiki-nav-count">' + s.count + '</span>' : '';
    navHtml += '<a href="' + s.href + '" class="wiki-nav-link' + actCls + '"><span>' + s.icon + '</span><span>' + s.label + '</span>' + cnt + '</a>';
  }

  var header = document.createElement('header');
  header.className = 'wiki-shell-header';
  header.innerHTML =
    '<div class="wiki-topbar">' +
      '<a href="wiki.html" class="wiki-brand">' +
        '<img class="wiki-brand-logo" src="assets/ui/velscour_contact_skull.png" alt="Velscour Wiki">' +
        '<div class="wiki-brand-text">' +
          '<span class="wiki-brand-title">VELSCOUR <span>WIKI</span></span>' +
          '<span class="wiki-brand-sub">Official Game Compendium</span>' +
        '</div>' +
      '</a>' +
      '<div class="wiki-omnisearch" id="wiki-omnisearch">' +
        '<div class="wiki-omnisearch-input-wrap">' +
          '<span class="wiki-omnisearch-icon">🔍</span>' +
          '<input type="search" id="wiki-omni-input" autocomplete="off" placeholder="Search all classes, skills, talents, monsters, relics, lore...">' +
          '<span class="wiki-omnisearch-kbd">Ctrl+K</span>' +
        '</div>' +
        '<div class="wiki-omni-dropdown" id="wiki-omni-dropdown"></div>' +
      '</div>' +
      '<div class="wiki-top-actions">' +
        '<a href="https://velscour.com" class="btn-wiki-ext" target="_blank" rel="noopener" title="Official Velscour Homepage">🌐 <span class="hide-sm">velscour.com</span></a>' +
        '<a href="https://velscour.dagyr.me/" class="btn-wiki-play" target="_blank" rel="noopener" title="Play Velscour Online in Browser">⚔️ Play Game</a>' +
      '</div>' +
    '</div>' +
    '<nav class="wiki-subnav" aria-label="Wiki Sections">' +
      '<div class="wiki-subnav-inner">' + navHtml + '</div>' +
    '</nav>';

  document.body.insertBefore(header, document.body.firstChild);
})();

