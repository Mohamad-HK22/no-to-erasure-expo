(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const frame = $('#gallery-frame');
  const dialog = $('#exhibit-dialog');
  const labels = {document: 'Document', image: 'Artwork / map', video: 'Film'};
  let exhibits = [], activeIndex = 0, galleryReady = false;
  let readerFromGallery = false, zoom = 1, pendingExhibit = null;
  let documentPage = 0;
  let fitPageWidth = false;
  let layout = null, mapExpanded = true, currentRoom = null, projectPoint = null;
  function command(command, id) {
    frame.contentWindow?.postMessage({type:'gallery-command', command, id}, location.origin);
  }
  function syncPause() {
    command(dialog.open ? 'pause' : 'resume');
  }
  function node(tag, text, className) {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (className) e.className = className;
    return e;
  }
  function setZoom(value, fitWidth = false) {
    zoom = Math.max(1, Math.min(3, value));
    fitPageWidth = fitWidth;
    const viewport = $('#poster-viewport');
    viewport.classList.toggle('enlarged', zoom > 1);
    viewport.classList.toggle('fit-width', fitWidth);
    viewport.style.setProperty('--poster-zoom', zoom);
    viewport.scrollTop = 0;
    viewport.scrollLeft = 0;
    $('#zoom-label').textContent = fitWidth ? 'Fit to width' : zoom === 1 ? 'Fit to view' : `${zoom}× detail`;
    $('#zoom-out').disabled = zoom === 1;
    $('#zoom-in').disabled = zoom === 3;
    $('#full-image').setAttribute('aria-label', zoom === 1 ? 'Enlarge page in this panel' : 'Fit page to this panel');
  }
  function stopVideo() {
    // Stop local media and release its source on close, Escape or record changes.
    $('#video-player-slot').querySelectorAll('video').forEach(player => {
      player.pause(); player.removeAttribute('src'); player.load();
    });
    $('#video-player-slot').replaceChildren();
  }
  function renderVideo(exhibit) {
    stopVideo();
    const isVideo = exhibit.type === 'video';
    dialog.classList.toggle('video-mode', isVideo);
    $('#poster-inspector').hidden = isVideo;
    $('#video-inspector').hidden = !isVideo;
    if (!isVideo) return;
    if (exhibit.videoUrl) {
      const player = document.createElement('video');
      player.id = 'local-film'; player.className = 'local-video-player';
      player.controls = true; player.playsInline = true; player.preload = 'metadata';
      player.src = exhibit.videoUrl; player.poster = exhibit.image;
      player.setAttribute('aria-label', exhibit.title);
      player.append(node('p', 'Your browser cannot play this film. Use Download film below.'));
      $('#video-source-label').textContent = 'Film · Available offline';
      $('#video-player-slot').append(player);
      return;
    }
    $('#video-source-label').textContent = 'YouTube · Internet required';
    if (!/^[A-Za-z0-9_-]{11}$/.test(exhibit.videoId || '')) {
      $('#video-player-slot').append(node('p', 'This video has no valid YouTube player ID. You can use the source link below.', 'video-unavailable'));
      return;
    }
    const player = document.createElement('iframe');
    player.className = 'youtube-player';
    player.title = `YouTube video: ${exhibit.title}`;
    player.src = `https://www.youtube-nocookie.com/embed/${exhibit.videoId}?playsinline=1&rel=0&autoplay=0`;
    player.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    player.allowFullscreen = true;
    player.referrerPolicy = 'strict-origin-when-cross-origin';
    $('#video-player-slot').append(player);
  }
  function setDocumentPage(value) {
    const e = exhibits[activeIndex];
    if (!e || e.type !== 'document' || !e.pages?.length) return;
    documentPage = Math.max(0, Math.min(e.pages.length - 1, value));
    $('#detail-image').src = e.pages[documentPage];
    $('#detail-image').alt = `${e.title} — page ${documentPage + 1} of ${e.pages.length}`;
    $('#page-select').value = String(documentPage);
    $('#page-previous').disabled = documentPage === 0;
    $('#page-next').disabled = documentPage === e.pages.length - 1;
    setZoom(zoom, fitPageWidth);
    $('#announcement').textContent = `${e.shortTitle || e.title}, page ${documentPage + 1} of ${e.pages.length}`;
  }
  function renderDocument(e) {
    const isDocument = e.type === 'document' && Array.isArray(e.pages) && e.pages.length > 0;
    dialog.classList.toggle('document-mode', isDocument);
    $('#document-toolbar').hidden = !isDocument;
    if (!isDocument) return;
    const select = $('#page-select'); select.replaceChildren();
    e.pages.forEach((_, index) => {
      const option = node('option', String(index + 1)); option.value = String(index); select.append(option);
    });
    $('#page-count').textContent = `of ${e.pages.length}`;
    setZoom(1, true);
    setDocumentPage(0);
  }
  function showExhibit(id, fromGallery = false) {
    const idx = exhibits.findIndex(e => e.id === id);
    if (idx < 0) { if (!exhibits.length) pendingExhibit = {id, fromGallery}; return; }
    readerFromGallery = fromGallery;
    activeIndex = idx;
    const e = exhibits[idx];
    renderVideo(e);
    dialog.classList.toggle('image-mode', e.type === 'image');
    $('#detail-kind').textContent = e.documentKind || labels[e.type];
    $('#detail-number').textContent = `WORK ${String(idx+1).padStart(2,'0')} / ${String(exhibits.length).padStart(2,'0')}`;
    $('#exhibit-title').textContent = e.title;
    $('#detail-image').src = e.fullImage || e.image;
    $('#detail-image').alt = e.alt;
    $('#detail-summary').textContent = e.summary;
    $('#detail-body').replaceChildren();
    const paragraphs = Array.isArray(e.body) ? e.body : (e.body ? [e.body] : []);
    paragraphs.forEach(s => $('#detail-body').append(node('p',s)));
    $('#detail-metadata').replaceChildren();
    Object.entries(e.archival || {}).forEach(([key,value]) => {
      if (!value) return;
      $('#detail-metadata').append(node('dt',key),node('dd',value));
    });
    $('#detail-actions').replaceChildren();
    if (e.pdfUrl || e.videoUrl || e.originalUrl) {
      const a = node('a', e.pdfUrl ? 'Download original PDF ↓' : e.videoUrl ? 'Download film ↓' : 'Download original image ↓', 'action-link');
      a.href = e.pdfUrl || e.videoUrl || e.originalUrl; a.download = e.sourceFilename || e.id;
      $('#detail-actions').append(a);
    }
    if (e.sourceUrl) {
      const a = node('a', e.sourceLabel || 'AUB collection record ↗', 'video-source-link');
      a.href = e.sourceUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      $('#detail-actions').append(a);
    }
    (e.relatedIds || []).forEach(id => {
      const related = exhibits.find(work => work.id === id);
      if (!related) return;
      const b = node('button', `Read: ${related.shortTitle || related.title} →`, 'small-button related-work');
      b.onclick = () => showExhibit(id, readerFromGallery);
      $('#detail-actions').append(b);
    });
    if (e.externalUrl) {
      const a = node('a', e.type === 'video' ? 'Open on YouTube ↗' : 'Read the external source ↗', e.type === 'video' ? 'video-source-link' : 'action-link');
      a.href = e.externalUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
      $('#detail-actions').append(a);
      if (e.type === 'video') $('#detail-actions').append(node('p', 'If the player is unavailable, use the source link above.', 'video-fallback-note'));
    }
    if (!fromGallery) {
      const b = node('button', 'Find this work in the gallery ↗', 'small-button');
      b.onclick = () => { dialog.close(); command('focus', e.id); frame.focus(); };
      $('#detail-actions').append(b);
    }
    $('#detail-credit').textContent = e.credit || '';
    $('#detail-position').textContent = `${idx+1} of ${exhibits.length}`;
    setZoom(1);
    renderDocument(e);
    if (e.type === 'image') setZoom(1, true);
    $('#poster-viewport').setAttribute('aria-label', e.type === 'document' ? 'Document page. Scroll to inspect when enlarged.' : 'Complete artwork or map. Scroll to inspect details.');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    syncPause();
    history.replaceState(null, '', `#work=${encodeURIComponent(e.id)}`);
  }
  function renderStrip() {
    const list = $('#strip-items'); list.replaceChildren();
    exhibits.forEach(e => {
      const b = node('button', undefined, 'strip-work'), img = node('img'), copy = node('span');
      img.src = e.image; img.alt = '';
      b.title = e.title; b.setAttribute('aria-label', `${e.title}, ${labels[e.type]}. Open exhibit`);
      copy.append(node('strong',e.shortTitle || e.title), node('small',labels[e.type]));
      b.append(img,copy); b.onclick = () => showExhibit(e.id, true); list.append(b);
    });
  }
  function svgNode(tag, attrs = {}, text) {
    const n = document.createElementNS('http://www.w3.org/2000/svg',tag);
    Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v));
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function toggleMap(open) {
    mapExpanded = open;
    $('#minimap').hidden = !open || !layout;
    $('#map-toggle').setAttribute('aria-expanded', open);
    $('#map-toggle').textContent = open ? 'Hide map' : 'Show map';
  }
  function renderMap(data) {
    if (!Array.isArray(data.rooms) || !data.bounds) return;
    layout = data;
    currentRoom = null;
    const svg = $('#map-drawing'), b = data.bounds, scale = 192 / Math.max(b.maxX-b.minX,b.maxZ-b.minZ), pad = 12;
    const width = (b.maxX-b.minX)*scale + pad*2, height = (b.maxZ-b.minZ)*scale + pad*2;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.replaceChildren();
    projectPoint = (x,z) => [pad + (x-b.minX)*scale, pad + (b.maxZ-z)*scale];
    function mapDestination(id, title, className) {
      const g = svgNode('g', {'class':`map-destination ${className}`,'data-room':id,role:'button',tabindex:'0','aria-label':title,'aria-pressed':'false'});
      const visit = () => { if (!document.querySelector('dialog[open]')) { command('room',id); frame.focus(); } };
      g.addEventListener('click',visit);
      g.addEventListener('keydown',e => { if (e.key==='Enter' || e.key===' ') { e.preventDefault(); visit(); } });
      return g;
    }
    data.rooms.forEach((room,i) => {
      const [cx,cy] = projectPoint(room.labelX ?? room.x,room.labelZ ?? room.z);
      const g = mapDestination(room.id,`Visit area ${i+1}: ${room.title}`,'map-room');
      if (room.polygon) {
        g.append(svgNode('polygon',{points:room.polygon.map(p=>projectPoint(p.x,p.z).join(',')).join(' ')}));
      } else {
        g.append(svgNode('rect',{x:cx-room.width*scale/2,y:cy-room.depth*scale/2,width:room.width*scale,height:room.depth*scale,rx:1}));
      }
      g.append(svgNode('text',{x:cx,y:cy-3,'text-anchor':'middle','class':'map-number'},String(i+1).padStart(2,'0')));
      g.append(svgNode('text',{x:cx,y:cy+10,'text-anchor':'middle'},room.shortTitle || room.title));
      svg.append(g);
    });
    if (data.atrium) {
      const court = data.atrium, [cx,cy] = projectPoint(court.x,court.z);
      const g = mapDestination('atrium',`Visit ${court.title || 'Entrance'}`,'map-atrium');
      g.append(svgNode('polygon',{points:court.polygon.map(p=>projectPoint(p.x,p.z).join(',')).join(' '),'class':'map-court'}));
      g.append(svgNode('text',{x:cx,y:cy+3,'text-anchor':'middle'},court.shortTitle || 'Entry'));
      svg.append(g);
    }
    const walls = svgNode('g',{'class':'map-walls','aria-hidden':'true'});
    (data.walls || []).forEach(wall => {
      const [x1,y1] = projectPoint(wall.x1,wall.z1), [x2,y2] = projectPoint(wall.x2,wall.z2);
      walls.append(svgNode('line',{x1,y1,x2,y2}));
    });
    svg.append(walls);
    const marker = svgNode('g',{id:'map-visitor','aria-hidden':'true',visibility:'hidden'});
    marker.append(svgNode('circle',{r:7,'class':'visitor-halo'}),svgNode('path',{d:'M0 -7 L5 5 L0 3 L-5 5 Z','class':'visitor-arrow'}));
    svg.append(marker);
    toggleMap(mapExpanded);
    command('position');
  }
  function updatePosition(pos) {
    if (!layout || !projectPoint || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const [x,y] = projectPoint(pos.x,pos.z), marker = $('#map-visitor');
    if (!marker) return;
    marker.setAttribute('transform',`translate(${x} ${y}) rotate(${(pos.yaw || 0)*180/Math.PI})`);
    marker.setAttribute('visibility','visible');
    marker.dataset.x = pos.x; marker.dataset.z = pos.z; marker.dataset.yaw = pos.yaw || 0;
    if (pos.roomId !== currentRoom) {
      currentRoom = pos.roomId;
      const index = layout.rooms.findIndex(r => r.id === currentRoom), room = layout.rooms[index];
      if (room) { $('#current-room').textContent = `${String(index+1).padStart(2,'0')} · ${room.title}`; $('#current-room').title = room.title; }
      else if (currentRoom === 'atrium') { $('#current-room').textContent = layout.atrium?.title || 'Entrance'; $('#current-room').title = layout.atrium?.title || 'Entrance'; }
      document.querySelectorAll('.map-destination').forEach(g => {
        const active = g.dataset.room === currentRoom;
        g.classList.toggle('active',active); g.setAttribute('aria-pressed',active);
      });
    }
  }
  $('[data-close]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    stopVideo();
    syncPause();
    history.replaceState(null,'',location.pathname+location.search);
    if (readerFromGallery) frame.focus();
  });
  dialog.addEventListener('click', ev => {
    if (ev.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) dialog.close();
  });
  $('#zoom-in').onclick = () => setZoom(zoom+1);
  $('#page-previous').onclick = () => setDocumentPage(documentPage - 1);
  $('#page-next').onclick = () => setDocumentPage(documentPage + 1);
  $('#page-select').onchange = () => setDocumentPage(Number($('#page-select').value));
  $('#zoom-out').onclick = () => setZoom(zoom-1);
  $('#zoom-fit').onclick = () => setZoom(1);
  $('#zoom-width').onclick = () => setZoom(1, true);
  $('#full-image').onclick = () => setZoom(zoom===1 ? 2 : 1);
  $('#detail-previous').onclick = () => showExhibit(exhibits[(activeIndex+exhibits.length-1)%exhibits.length].id,readerFromGallery);
  $('#detail-next').onclick = () => showExhibit(exhibits[(activeIndex+1)%exhibits.length].id,readerFromGallery);
  $('#previous-work').onclick = () => command('previous');
  $('#next-work').onclick = () => command('next');
  $('#reset-room').onclick = () => currentRoom ? command('room',currentRoom) : command('reset');
  $('#map-toggle').onclick = () => toggleMap(!mapExpanded);
  function help(open) { $('#gallery-help').hidden = !open; $('#help-button').setAttribute('aria-expanded',open); }
  $('#help-button').onclick = () => help($('#gallery-help').hidden);
  $('#help-close').onclick = () => help(false);
  frame.addEventListener('load', () => command('request-layout'));
  window.addEventListener('message',ev => {
    if (ev.origin !== location.origin || ev.source !== frame.contentWindow) return;
    const data = ev.data;
    if (data?.type === 'gallery-ready') {
      galleryReady = true; $('#stage-loading').classList.add('ready');
      setTimeout(() => $('#stage-loading').hidden = true,450);
      command('request-layout'); syncPause();
    }
    if (data?.type === 'gallery-layout') renderMap(data);
    if (data?.type === 'visitor-position') updatePosition(data);
    if (data?.type === 'exhibit-selected') showExhibit(data.id,true);
    if (data?.type === 'gallery-error' && !galleryReady) {
      const loading = $('#stage-loading');
      loading.querySelector('p').textContent = 'The 3D gallery could not open.';
      loading.querySelector('span:not(.spinner)').textContent = 'You can still open the works below the gallery.';
      loading.querySelector('.spinner').hidden = true;
    }
  });
  fetch('content/exhibits.json').then(r => {
    if (!r.ok) throw new Error('Content unavailable'); return r.json();
  }).then(data => {
    exhibits = Array.isArray(data) ? data : data.exhibits;
    $('#work-count').textContent = String(exhibits.length).padStart(2, '0');
    renderStrip();
    if (pendingExhibit) { showExhibit(pendingExhibit.id,pendingExhibit.fromGallery); pendingExhibit = null; }
    else { const id = new URLSearchParams(location.hash.slice(1)).get('work'); if (id) showExhibit(id); }
  }).catch(err => {
    $('#strip-items').append(node('p', 'The exhibition works could not load. Reload this page to try again.'));
    console.error(err);
  });
  setTimeout(() => {
    if (!galleryReady && !$('#stage-loading .spinner').hidden) {
      $('#stage-loading').querySelector('p').textContent = 'The rooms are taking a little longer…';
      $('#stage-loading').querySelector('span:not(.spinner)').textContent = 'You can open the works below while the gallery loads.';
    }
  },20000);
})();
