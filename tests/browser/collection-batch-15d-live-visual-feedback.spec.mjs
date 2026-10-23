import {expect, test} from "@playwright/test";
import {attachDiagnostics, attachPageDiagnostics} from "./helpers/eloron-ui.mjs";

test.setTimeout(90000);

async function installGabarArtworkAudit(page) {
  await page.evaluate(() => {
    window.__gabarArtworkAudit=[];
    new MutationObserver(records=>{
      for(const record of records)for(const node of record.addedNodes){
        if(!node.matches?.('.batch02-gabar-spell-presentation'))continue;
        const card=node.querySelector('.canonical-card-preview'),viewport=card.querySelector('.fc-zoom-art'),image=viewport.querySelector('img.fz-img');
        const item={spell:node.dataset.cardId,firstUsefulFrameLoaded:null,geometry:null};
        window.__gabarArtworkAudit.push(item);
        const sample=()=>{
          if(!node.isConnected)return;
          if(Number(getComputedStyle(node).opacity)>.01&&item.firstUsefulFrameLoaded===null)item.firstUsefulFrameLoaded=image.complete&&image.naturalWidth>0;
          if(node.dataset.batch02GabarStage==='spell-centered-readable'&&!item.geometry){
            const style=getComputedStyle(image),box=getComputedStyle(viewport);
            const width=image.clientWidth,height=image.clientHeight,nw=image.naturalWidth,nh=image.naturalHeight;
            const scale=style.objectFit==='cover'?Math.max(width/nw,height/nh):style.objectFit==='contain'?Math.min(width/nw,height/nh):null;
            const paintedWidth=scale===null?width:nw*scale,paintedHeight=scale===null?height:nh*scale;
            item.geometry={naturalWidth:nw,naturalHeight:nh,src:image.currentSrc,loaded:image.complete&&nw>0,
              viewport:{width:viewport.clientWidth,height:viewport.clientHeight,overflow:box.overflow,padding:box.padding,margin:box.margin},
              image:{width,height,objectFit:style.objectFit,objectPosition:style.objectPosition,widthCSS:style.width,heightCSS:style.height,maxWidth:style.maxWidth,maxHeight:style.maxHeight,padding:style.padding,margin:style.margin,background:style.backgroundImage},
              paintedWidth,paintedHeight,horizontalCoverage:Math.min(1,paintedWidth/viewport.clientWidth),verticalCoverage:Math.min(1,paintedHeight/viewport.clientHeight),
              sideBandEach:Math.max(0,(viewport.clientWidth-paintedWidth)/2),uniformScale:scale,
              card:{width:card.getBoundingClientRect().width,height:card.getBoundingClientRect().height,title:card.querySelector('.fc-zoom-name')?.textContent||card.querySelector('.fc-zoom-name-b')?.textContent,text:card.querySelector('.fc-zoom-desc-z')?.textContent}};
          }
          if(!item.geometry||item.firstUsefulFrameLoaded===null)requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
    }).observe(document.body,{childList:true});
  });
}

function expectGabarArtworkCoverage(item) {
  expect(item.firstUsefulFrameLoaded,'artwork is loaded in the first useful reveal frame').toBe(true);
  const g=item.geometry;
  expect(g.loaded).toBe(true);
  expect(g.horizontalCoverage,'real painted artwork must fill the illustration viewport width').toBeGreaterThanOrEqual(.999);
  expect(g.verticalCoverage,'real painted artwork must fill the illustration viewport height').toBeGreaterThanOrEqual(.999);
  expect(g.image.width).toBe(g.viewport.width);
  expect(g.image.height).toBe(g.viewport.height);
  expect(g.uniformScale,'the original illustration aspect ratio must be preserved, not stretched').not.toBeNull();
  expect(g.image.objectPosition).toBe('50% 50%');
  expect(g.viewport.overflow).toBe('hidden');
  expect(g.image.padding).toBe('0px');
  expect(g.image.margin).toBe('0px');
}

test('15D8E real drawn Gabar spell artwork fully covers its illustration viewport',async({page},testInfo)=>{
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent=await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  await installGabarArtworkAudit(page);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await waitReadableGabar(page);
  await expect.poll(()=>page.evaluate(()=>!!window.__gabarArtworkAudit[0]?.geometry)).toBe(true);
  const item=await page.evaluate(()=>window.__gabarArtworkAudit[0]);
  console.log('GABAR_ARTWORK '+JSON.stringify(item));
  await testInfo.attach('gabar-artwork-geometry',{contentType:'application/json',body:Buffer.from(JSON.stringify(item,null,2))});
  await page.screenshot({path:testInfo.outputPath('S000057-real-reveal.png')});
  expectGabarArtworkCoverage(item);
  await waitForLastGabarDrawPromise(page);
});

async function installGabarReadableTiming(page, testInfo) {
  await page.exposeBinding("captureGabarTimingFrame", async (_, cardId, phase) => {
    await page.screenshot({path:testInfo.outputPath(`${cardId}-${phase}.png`)});
  });
  await page.evaluate(() => {
    window.__gabarReadableTimings = [];
    new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!node.matches?.(".batch02-gabar-spell-presentation")) continue;
        const card = node.querySelector(".canonical-card-preview");
        const item = {cardId:node.dataset.cardId, insertedAt:performance.now(),
          samples:[], captures:[], violations:[], animationEvents:[], lockDuringAllFrames:true};
        for (const type of ["transitionend", "animationend"]) node.addEventListener(type, event => {
          item.animationEvents.push({type, at:performance.now(), target:event.target.className, property:event.propertyName, animation:event.animationName});
        });
        window.__gabarReadableTimings.push(item);
        const rule = COLLECTION_BATCH_02_EVOLUTION[item.cardId];
        const sample = () => {
          const now = performance.now();
          if (!node.isConnected) {
            item.removedAt = now;
            item.totalMs = now-item.insertedAt;
            item.entryMs = item.readableAt-item.insertedAt;
            item.readableMs = Math.max(0,(item.exitAt || now)-item.readableAt);
            item.exitMs = now-item.exitAt;
            return;
          }
          item.lockDuringAllFrames &&= gabarEvolutionResolutionInProgress;
          const style = getComputedStyle(node);
          const cardStyle = getComputedStyle(card);
          const innerStyle = getComputedStyle(card.querySelector('.fc-zoom'));
          const rect = card.getBoundingClientRect();
          const exiting = node.getAnimations().some(animation => animation.id === 'gabar-spell-exit');
          const outerMatrix = new DOMMatrixReadOnly(style.transform);
          const cardMatrix = new DOMMatrixReadOnly(cardStyle.transform);
          const innerMatrix = new DOMMatrixReadOnly(innerStyle.transform);
          const fullyReadable = Number(style.opacity) >= .999999 && Number(cardStyle.opacity) >= .999999 && Number(innerStyle.opacity) >= .999999
            && [outerMatrix,cardMatrix,innerMatrix].every(matrix => Math.abs(matrix.a-1)<.000001 && Math.abs(matrix.d-1)<.000001);
          if (exiting) item.exitAt ??= now;
          if (fullyReadable && !item.exitAt) {
            item.readableAt ??= now;
            item.lastReadableAt = now;
            const frame = {at:now, opacity:Number(style.opacity), transform:style.transform,
              cardTransform:cardStyle.transform, width:rect.width, height:rect.height,
              oldPresent:livingServantCardsForPlayer(player1).some(fc=>fc.dataset.id===rule.remove),
              newAbsent:!playerHand(player1).map(getRuntimeCardId).includes(rule.create),
              spellNotInHand:!playerHand(player1).map(getRuntimeCardId).includes(item.cardId),
              messageAbsent:!document.querySelector("#notif")?.textContent};
            item.samples.push(frame);
            if (frame.opacity < .999 || !frame.oldPresent || !frame.newAbsent || !frame.spellNotInHand || !frame.messageAbsent) item.violations.push(frame);
            const elapsed = now-item.readableAt;
            const phase = !item.captures.includes("start") ? "start" : elapsed >= 1100 && !item.captures.includes("middle") ? "middle" : elapsed >= 2150 && !item.captures.includes("before-exit") ? "before-exit" : null;
            if (phase) {
              item.captures.push(phase);
              window.captureGabarTimingFrame(item.cardId, phase);
            }
          } else if (item.readableAt && !item.exitAt) item.violations.push({at:now,reason:'premature-loss-of-readability'});
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }
    }).observe(document.body,{childList:true});
  });
}

function blockingConsoleErrors(diagnostics) {
  return diagnostics.consoleErrors.filter(message => !/Failed to load resource: the server responded with a status of 404/i.test(message));
}

async function installStrictGabarChronology(page) {
  await page.evaluate(() => {
    window.__strictGabar = [];
    let current = null;
    const tracked = new WeakSet();
    const mark = (name,detail={}) => { if(current) current.events.push({name,at:performance.now(),locked:gabarEvolutionResolutionInProgress,...detail}); };
    const inspect = node => {
      if (!current || current.unlocked || !node?.matches) return;
      for (const element of [node,...node.querySelectorAll('.batch02-responsibility-pulse,.batch02-gabar-arrival-halo,.batch02-gabar-deck-arrival-halo')]) {
        const old = element.classList.contains('batch02-responsibility-pulse');
        const incoming = element.matches('.batch02-gabar-arrival-halo,.batch02-gabar-deck-arrival-halo');
        if ((!old&&!incoming)||tracked.has(element)) continue;
        const expected = old?'batch02ResponsibilityPulse':'batch02GabarArrivalHalo';
        const animation=element.getAnimations().find(a=>a.effect.target===element&&a.animationName===expected);
        if(!animation)continue;
        tracked.add(element);
        const key=old?'old':'new',group=current;
        const timing=animation.effect.getTiming();
        const pulse={startObserved:performance.now(),duration:timing.duration,elementId:element.dataset.id||element.id,animation,ended:false};
        group[key]=pulse;
        mark(old?'oldGabarPulseStarted':'newGabarPulseStarted',{animation:expected});
        animation.ready.then(()=>{pulse.expectedEnd=animation.startTime+Number(timing.duration);});
        animation.finished.then(()=>{pulse.ended=true;pulse.end=performance.now();group.events.push({name:old?'oldGabarPulseEnded':'newGabarPulseEnded',at:pulse.end,locked:gabarEvolutionResolutionInProgress});},()=>{pulse.cancelledAt=performance.now();});
      }
    };
    new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node.matches?.('.batch02-gabar-spell-presentation')){
            current={spell:node.dataset.cardId,events:[],violations:[]};window.__strictGabar.push(current);
            mark('spellRevealVisible');
            const group=current;
            const sample=()=>{
              if(current!==group||group.unlocked)return;
              const rule=COLLECTION_BATCH_02_EVOLUTION[group.spell];
              const active=name=>document.getAnimations().some(a=>a.animationName===name&&a.playState==='running');
              const reveal=!!document.querySelector('.batch02-gabar-spell-presentation');
              const oldPulse=active('batch02ResponsibilityPulse'),newPulse=active('batch02GabarArrivalHalo');
              const incoming=[...document.querySelectorAll(`.hc[data-id="${rule.create}"]`)];
              const oldNode=document.querySelector(`.fc[data-id="${rule.remove}"],.hc[data-id="${rule.remove}"]`);
              const oldPresent=!!oldNode;
              const bad=[];
              if(reveal&&oldNode){
                const rect=oldNode.getBoundingClientRect();
                const geometry={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
                group.oldRevealGeometry??=geometry;
                if(Object.keys(geometry).some(key=>Math.abs(geometry[key]-group.oldRevealGeometry[key])>.5))bad.push('old-gabar-moved-during-reveal');
              }
              if(reveal&&(oldPulse||newPulse||incoming.length))bad.push('transformation-during-reveal');
              if(oldPulse&&newPulse)bad.push('overlapping-pulses');
              if(newPulse&&document.querySelector('#notif')?.textContent===COLLECTION_BATCH_15D2_MESSAGES[group.spell])bad.push('message-during-incoming-pulse');
              if(oldPresent&&incoming.length)bad.push('old-and-new-coexist');
              if(incoming.length>1)bad.push('duplicate-new-card');
              if(incoming.some(card=>[...card.querySelectorAll('img')].some(img=>!img.complete||!img.naturalWidth)))bad.push('partially-rendered-card');
              if(document.querySelector('#card-preview-layer.preview-open'))bad.push('parasitic-hover-preview');
              if(!gabarEvolutionResolutionInProgress)bad.push('unlocked-before-final-message');
              if(bad.length)group.violations.push({at:performance.now(),bad});
              group.frameCount=(group.frameCount||0)+1;
              requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          }
          if(current&&node.isConnected&&node.matches?.(`.hc[data-id="${COLLECTION_BATCH_02_EVOLUTION[current.spell].create}"]`))mark('newGabarInsertedAtDestination',{loaded:[...node.querySelectorAll('img')].every(img=>img.complete&&img.naturalWidth>0)});
          inspect(node);
        }
        for(const node of record.removedNodes){if(node.matches?.('.batch02-gabar-spell-presentation'))mark('spellRevealRemoved');if(current&&node.matches?.(`.fc[data-id="${COLLECTION_BATCH_02_EVOLUTION[current.spell].remove}"],.hc[data-id="${COLLECTION_BATCH_02_EVOLUTION[current.spell].remove}"]`))mark('oldGabarRemoved');}
        if(record.type==='attributes')inspect(record.target);
        if(current&&!current.unlocked&&!current.events.some(e=>e.name==='newGabarInsertedAtDestination')&&record.target.matches?.('.deck-count')&&playerDrawPile(player1).at(-1)===COLLECTION_BATCH_02_EVOLUTION[current.spell].create)mark('newGabarInsertedAtDestination',{loaded:true,destination:'deck-top'});
      }
    }).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
    document.body.addEventListener('batch02-gabar-visual-phase',event=>{
      const phase=event.detail?.phase;
      if(phase==='spell-centered-readable')mark('spellRevealFullyReadable');
      if(phase==='resolution-message-shown'){
        mark('resolutionMessageShown',{newPulseState:current?.new?.animation.playState});
        if(current)current.messageAt=performance.now();
      }
      if(phase==='resolution-lock-released'){mark('interactionLockReleased');if(current)current.unlocked=true;}
    });
  });
}

async function strictGabarEvidence(page,testInfo,label) {
  const groups=await page.evaluate(()=>window.__strictGabar.map(group=>({...group,old:group.old?{...group.old,animation:undefined}:null,new:group.new?{...group.new,animation:undefined}:null})));
  console.log('STRICT_GABAR '+JSON.stringify(groups));
  await testInfo.attach(label,{contentType:'application/json',body:Buffer.from(JSON.stringify(groups,null,2))});
  for(const group of groups){
    const at=name=>{const event=group.events.find(e=>e.name===name);expect(event,`${group.spell}: missing ${name}`).toBeTruthy();return event.at;};
    expect(group.old?.ended,`${group.spell}: old CSS pulse must finish naturally`).toBe(true);
    expect(group.new?.ended,`${group.spell}: new CSS pulse must finish naturally`).toBe(true);
    expect(at('spellRevealRemoved')).toBeLessThanOrEqual(at('oldGabarPulseStarted'));
    expect(at('oldGabarPulseStarted')).toBeLessThan(at('oldGabarPulseEnded'));
    expect(at('oldGabarPulseEnded')).toBeLessThanOrEqual(at('oldGabarRemoved'));
    expect(at('oldGabarRemoved')).toBeLessThan(at('newGabarInsertedAtDestination'));
    expect(at('newGabarInsertedAtDestination')).toBeLessThanOrEqual(at('newGabarPulseStarted'));
    expect(at('newGabarPulseStarted')).toBeLessThan(at('newGabarPulseEnded'));
    expect(at('newGabarPulseEnded')).toBeLessThan(at('resolutionMessageShown'));
    expect(at('resolutionMessageShown')).toBeLessThanOrEqual(at('interactionLockReleased'));
    expect(group.events.filter(e=>e.name==='newGabarInsertedAtDestination').every(e=>e.loaded&&e.at<group.messageAt)).toBe(true);
    expect(group.events.filter(e=>e.name==='newGabarInsertedAtDestination')).toHaveLength(1);
    expect(group.frameCount).toBeGreaterThan(0);
    expect(group.violations).toEqual([]);
    expect(group.events.filter(e=>e.name!=='interactionLockReleased').every(e=>e.locked)).toBe(true);
  }
  return groups;
}

test('15D8D start-turn must not reinsert or animate the new card after the final message',async({page},testInfo)=>{
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent=await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  await installStrictGabarChronology(page);
  await page.locator('#btnEndTurn').click();
  await expect.poll(()=>page.evaluate(()=>currentPlayer==='player2'&&!turnTransitionInProgress),{timeout:30000}).toBe(true);
  await page.locator('#btnEndTurn').click();
  await expect.poll(()=>page.evaluate(()=>currentPlayer==='player1'&&!turnTransitionInProgress),{timeout:30000}).toBe(true);
  const evidence=await page.evaluate(()=>window.__strictGabar.map(group=>({...group,old:group.old?{...group.old,animation:undefined}:null,new:group.new?{...group.new,animation:undefined}:null})));
  console.log('STRICT_START_TURN '+JSON.stringify(evidence));
  await testInfo.attach('start-turn-dom-chronology',{contentType:'application/json',body:Buffer.from(JSON.stringify(evidence,null,2))});
  expect(evidence).toHaveLength(1);
  const group=evidence[0];
  expect(group.events.filter(event=>event.name==='newGabarInsertedAtDestination'&&event.at>group.messageAt),'the final message must follow the last real card insertion, not precede a fresh drawing animation').toEqual([]);
  await strictGabarEvidence(page,testInfo,'strict-start-turn');
});

test('15D8D strict DOM chronology has no truncated or overlapping Gabar phases',async({page},testInfo)=>{
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent=await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  await installStrictGabarChronology(page);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await waitForLastGabarDrawPromise(page);
  const evidence=await page.evaluate(()=>window.__strictGabar.map(group=>({...group,old:group.old?{...group.old,animation:undefined}:null,new:group.new?{...group.new,animation:undefined}:null})));
  console.log('STRICT_GABAR '+JSON.stringify(evidence));
  await testInfo.attach('strict-dom-chronology',{contentType:'application/json',body:Buffer.from(JSON.stringify(evidence,null,2))});
  const group=evidence[0];
  expect(group.spell).toBe('S000057');
  expect(group.events.find(event=>event.name==='newGabarInsertedAtDestination').loaded,'new Gabar must not become visible before its real artwork is ready').toBe(true);
  expect(group.new).toBeTruthy();
  expect(group.messageAt,'message must follow the full real incoming CSS pulse').toBeGreaterThan(group.new.expectedEnd);
  expect(group.new.ended).toBe(true);
  expect(group.old.ended).toBe(true);
  await strictGabarEvidence(page,testInfo,'strict-manual');
});

test('15D8D source occurrence moved to hand pulses in its real zone before evolution',async({page},testInfo)=>{
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent=await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  // Preparation uses the existing real return-to-owner-hand operation, not a
  // fabricated evolution result, generated spell, clock or replacement identity.
  const moved=await page.evaluate(()=>batch03MoveServantToOwnerHandOrGraveyard(document.querySelector('#yriaServants .fc[data-id="H000032"]')));
  expect(moved.destination).toBe('hand');
  await installStrictGabarChronology(page);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await waitForLastGabarDrawPromise(page);
  const groups=await strictGabarEvidence(page,testInfo,'strict-source-in-hand');
  expect(groups[0].old.elementId).toBe('H000032');
  const phase=await page.evaluate(()=>window.__batch15d4Evidence.gabarTimeline.find(e=>e.type==='old-gabar-pulse-start'));
  expect(phase.zone).toBe('hand');
});

async function openBatch15DScenario(page, scenario, extra = "") {
  await page.addInitScript(() => {
    const sequence = [0, 0.18, 0.36, 0.54, 0.72, 0.9, 0.08, 0.26, 0.44, 0.62, 0.8];
    const nativeRandom = Math.random.bind(Math);
    let index = 0;
    Math.random = () => (index < sequence.length ? sequence[index++] : nativeRandom());
  });
  const suffix = extra ? `${extra}&batch15d2=${Date.now()}` : `&batch15d2=${Date.now()}`;
  await page.goto(`/code/partie-test-1.html?scenario=${scenario}${suffix}`);
  await expect.poll(() => page.evaluate(() => selectedScenarioId())).toBe(scenario);
  await expect(page.getByTestId("test-resource-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector("#btnEndTurn")?.classList.contains("vis") === true), {timeout:15000}).toBe(true);
  await installBatch15D2Observer(page);
}

async function installBatch15D2Observer(page) {
  await page.evaluate(() => {
    window.__batch15d2Observed = [];
    window.__batch15d4Evidence = {transfers:[], slotCounts:[], notifications:[], gabarTimeline:[]};
    window.__batch15d4NextTurnCalls = 0;
    if (!window.__batch15d4OriginalNextTurn && typeof window.nextTurn === "function") {
      window.__batch15d4OriginalNextTurn = window.nextTurn;
      window.nextTurn = function batch15d4TrackedNextTurn(...args) {
        window.__batch15d4NextTurnCalls += 1;
        return window.__batch15d4OriginalNextTurn.apply(this, args);
      };
    }
    const gabarZoneSnapshot = () => ({
      currentPlayer,
      turnSequence,
      gabarLocked:gabarEvolutionResolutionInProgress,
      actionsLeft:player1?.actionsLeft ?? null,
      nextTurnCalls:window.__batch15d4NextTurnCalls,
      hand:playerHand(player1).map(getRuntimeCardId),
      deck:playerDrawPile(player1).map(getRuntimeCardId),
      graveyard:player1.graveyard.map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
      notifications:[...(window.__batch15d4Evidence?.notifications || [])].map(item => item.text)
    });
    const recordGabar = (type, detail = {}) => {
      window.__batch15d4Evidence.gabarTimeline.push({type, at:performance.now(), ...gabarZoneSnapshot(), ...detail});
    };
    const rectSnapshot = element => {
      const rect = element?.getBoundingClientRect?.();
      if (!rect) return null;
      return {left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height, cx:rect.left + rect.width / 2, cy:rect.top + rect.height / 2};
    };
    const zoneRect = (playerKey, zone) => {
      const player = playerState(playerKey);
      if (!player) return null;
      const selector = zone === "deck" ? playerSelectors(player).deckBack : playerZoneSelector(player, zone === "graveyard" ? "cemetery" : "servants");
      return rectSnapshot(qs(selector));
    };
    const distance = (a, b) => a && b ? Math.hypot(a.cx - b.cx, a.cy - b.cy) : null;
    const slotSnapshot = () => {
      for (const playerKey of ["player1", "player2"]) {
        const player = playerState(playerKey);
        const zone = player ? qs(playerZoneSelector(player, "servants")) : null;
        const count = zone ? zone.querySelectorAll(":scope > .slot, :scope > .fc").length : 0;
        window.__batch15d4Evidence.slotCounts.push({playerKey, count, at:performance.now()});
      }
    };
    slotSnapshot();
    const readNode = node => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return null;
      const element = node;
      const matches = element.matches?.("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse,.batch02-gabar-spell-presentation .fc");
      if (!matches) return null;
      if (element.classList?.contains("batch15d-transfer-clone")) {
        const sourceOwner = element.dataset.batch15dSourceOwner;
        const sourceZone = element.dataset.batch15dSourceZone;
        const opponentKey = sourceOwner === "player1" ? "player2" : "player1";
        const fromCenter = {
          cx:parseFloat(element.style.getPropertyValue("--from-x")) + 46,
          cy:parseFloat(element.style.getPropertyValue("--from-y")) + 64
        };
        const ownerRect = zoneRect(sourceOwner, sourceZone);
        const opponentRect = zoneRect(opponentKey, sourceZone);
        window.__batch15d4Evidence.transfers.push({
          dataset:{...element.dataset},
          fromCenter,
          ownerRect,
          opponentRect,
          distanceToOwner:distance(fromCenter, ownerRect),
          distanceToOpponent:distance(fromCenter, opponentRect),
          at:performance.now()
        });
      }
      if (element.matches?.(".batch02-gabar-spell-presentation,[data-batch02-gabar-stage]")) {
        const rect = rectSnapshot(element);
        const viewport = {width:window.innerWidth, height:window.innerHeight, cx:window.innerWidth / 2, cy:window.innerHeight / 2};
        recordGabar(element.dataset.batch02GabarStage || "gabar-visual-node", {dataset:{...element.dataset}, className:element.className || "", text:element.textContent || "", rect, viewport});
      }
      if (element.matches?.(".batch02-gabar-spell-presentation .fc")) {
        const rect = rectSnapshot(element);
        const viewport = {width:window.innerWidth, height:window.innerHeight, cx:window.innerWidth / 2, cy:window.innerHeight / 2};
        const cardId = element.dataset.previewCardId || element.dataset.id || null;
        const data = cardId ? CARDS_DATA[cardId] : null;
        const expectedDescriptionHost = document.createElement("div");
        if (data) expectedDescriptionHost.innerHTML = renderZoomDescription(data, facColor(data.fac));
        const expectedCostHost = document.createElement("div");
        if (data && data.type !== "Avatar") expectedCostHost.innerHTML = renderCostHTML(cardId, currentPlayer);
        recordGabar("spell-card-visible", {
          cardId,
          dataset:{...element.dataset},
          className:element.className || "",
          text:element.textContent || "",
          rect,
          viewport,
          title:element.querySelector(".fz-name,.hc-name")?.textContent?.trim() || "",
          descriptionText:element.querySelector(".fz-desc-inner,.hc-desc-inner")?.textContent?.replace(/\s+/g, " ").trim() || "",
          costText:element.querySelector(".fc-zoom-cost-z,.hc-cost-z")?.textContent?.replace(/\s+/g, " ").trim() || "",
          imageSrc:element.querySelector(".fz-img,.hc-art,.fi")?.getAttribute("src") || "",
          expectedTitle:data?.name || "",
          expectedDescriptionText:expectedDescriptionHost.textContent?.replace(/\s+/g, " ").trim() || "",
          expectedCostText:expectedCostHost.textContent?.replace(/\s+/g, " ").trim() || "",
          hasAttackNode:!!element.querySelector(".fc-zoom-atk,.fc-atk,.hc-atk,.fc-stats,[data-atk]"),
          hasHealthNode:!!element.querySelector(".fc-zoom-pdv,.fc-pdv,.hc-pdv,.fc-stats,[data-pdv]"),
          hasPrepareBadge:!!element.querySelector(".fc-new-badge"),
          forbiddenText:/(NULL|null|undefined|SE PRÉPARE|SE PREPARE)/i.test(element.textContent || "")
        });
      }
      if (element.matches?.(".batch02-responsibility-pulse,[data-batch02-responsibility-active]")) {
        recordGabar("old-gabar-pulse-start", {dataset:{...element.dataset}, cardId:element.dataset.id || null});
      }
      if (element.matches?.("[data-batch02-new-gabar-arrival]")) {
        recordGabar(element.dataset.batch02NewGabarArrival === "end" ? "new-gabar-arrival-end" : "new-gabar-arrival-start", {dataset:{...element.dataset}, cardId:element.dataset.id || null});
      }
      return {
        className:element.className || "",
        dataset:{...element.dataset},
        text:element.textContent?.trim() || ""
      };
    };
    const remember = node => {
      const direct = readNode(node);
      if (direct) window.__batch15d2Observed.push(direct);
      if (node?.querySelectorAll) {
        node.querySelectorAll("[data-batch15d-transfer],[data-batch15d-nain-pulse],[data-batch15d-hand-halo],[data-batch15d-deck-pulse],.batch15d-transfer-clone,.batch15d-nain-board-pulse,.batch15d-nain-hand-halo,.batch15d-nain-deck-pulse,.batch02-gabar-spell-presentation .fc").forEach(child => {
          const item = readNode(child);
          if (item) window.__batch15d2Observed.push(item);
        });
      }
    };
    window.__batch15d2Observer?.disconnect?.();
    window.__batch15d2Observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        slotSnapshot();
        mutation.addedNodes.forEach(remember);
        if (mutation.type === "attributes") remember(mutation.target);
      }
    });
    window.__batch15d2Observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:["class", "data-batch15d-transfer", "data-batch15d-nain-pulse", "data-batch15d-hand-halo", "data-batch15d-deck-pulse", "data-batch02-gabar-stage", "data-batch02-responsibility-active", "data-batch02-new-gabar-arrival", "data-preview-card-id", "data-id"]});
    document.body.addEventListener("batch02-gabar-visual-phase", event => recordGabar(event.detail?.phase || "custom-event", event.detail || {}));
    const notif = document.querySelector("#notif");
    window.__batch15d4NotificationObserver?.disconnect?.();
    window.__batch15d4NotificationObserver = new MutationObserver(() => {
      const text = notif?.textContent || "";
      if (text) {
        const last = window.__batch15d4Evidence.notifications.at(-1);
        if (last?.text !== text) {
          window.__batch15d4Evidence.notifications.push({text, at:performance.now()});
          recordGabar("resolution-message", {text});
        }
      }
    });
    if (notif) window.__batch15d4NotificationObserver.observe(notif, {childList:true, characterData:true, subtree:true, attributes:true});
  });
}

async function playSpellFromHand(page, cardId, waitMs = 5600) {
  await expect(page.locator(`.hc[data-id="${cardId}"]`).first()).toBeVisible();
  await page.evaluate(id => {
    const card = document.querySelector(`.hc[data-id="${id}"]`);
    const target = document.querySelector(".board-bg");
    if (!card || !target) throw new Error(`Unable to drag ${id}`);
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));
  }, cardId);
  await page.waitForTimeout(waitMs);
}

async function dragHandCardToSelector(page, cardId, selector, waitMs = 1200) {
  await expect(page.locator(`.hc[data-id="${cardId}"]`).first()).toBeVisible();
  await page.evaluate(({cardId, selector}) => {
    const card = document.querySelector(`.hc[data-id="${cardId}"]`);
    const target = document.querySelector(selector);
    if (!card || !target) throw new Error(`Unable to drag ${cardId} to ${selector}`);
    const dataTransfer = new DataTransfer();
    card.dispatchEvent(new DragEvent("dragstart", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("dragover", {bubbles:true, cancelable:true, dataTransfer}));
    target.dispatchEvent(new DragEvent("drop", {bubbles:true, cancelable:true, dataTransfer}));
  }, {cardId, selector});
  await page.waitForTimeout(waitMs);
}

async function collapseTestPanelIfVisible(page) {
  await page.evaluate(() => document.querySelector('[data-testid="test-resource-panel-collapse"]')?.click());
}

async function state(page) {
  return page.evaluate(() => ({
    notification:document.querySelector("#notif")?.textContent || "",
    error:document.querySelector("#errMsg")?.textContent || "",
    observed:window.__batch15d2Observed || [],
    hand:playerHand(player1).map(getRuntimeCardId),
    deck:playerDrawPile(player1).map(getRuntimeCardId),
    graveyard:player1.graveyard.map(getRuntimeCardId),
    board:livingServantCardsForPlayer(player1).map(fc => fc.dataset.id),
    runtimeMaxS000014:CARDS_DATA.S000014?.max ?? null
  }));
}

async function waitForLastGabarDrawPromise(page) {
  const result = await page.evaluate(async () => {
    const pending = window.__batch15d6LastGabarDrawPromise;
    if (!pending || typeof pending.then !== "function") return {hasPromise:false};
    return {hasPromise:true, result:await pending};
  });
  expect(result.hasPromise).toBe(true);
  expect(result.result?.success).toBe(true);
  return result.result;
}

async function clickPlayer1DeckAtVisibleCenter(page) {
  const clickInfo = await page.evaluate(() => {
    const deck = document.querySelector(playerSelectors(player1).deckBack);
    if (!deck) return {ok:false, reason:"missing-deck"};
    const rect = deck.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const topElement = document.elementFromPoint(cx, cy);
    return {
      ok:true,
      cx,
      cy,
      deckRect:{left:rect.left, top:rect.top, right:rect.right, bottom:rect.bottom, width:rect.width, height:rect.height},
      topElement:{
        tag:topElement?.tagName || null,
        id:topElement?.id || null,
        className:String(topElement?.className || ""),
        testid:topElement?.dataset?.testid || null,
        cardId:topElement?.dataset?.id || topElement?.dataset?.cardId || null,
        closestPlayer1Deck:!!topElement?.closest?.(playerSelectors(player1).deckBack)
      }
    };
  });
  expect(clickInfo.ok, JSON.stringify(clickInfo)).toBe(true);
  await page.mouse.click(clickInfo.cx, clickInfo.cy);
  return clickInfo;
}

async function clearGabarPreClickNotifications(page) {
  await page.evaluate(() => {
    const notif = document.querySelector("#notif");
    if (notif) notif.textContent = "";
    if (window.__batch15d4Evidence) {
      window.__batch15d4Evidence.notifications = [];
      window.__batch15d4Evidence.gabarTimeline = [];
    }
  });
}

function firstTimelineEvent(evidence, type) {
  return evidence.gabarTimeline.find(item => item.type === type);
}

function expectGabarIntermediatePhases(evidence, testCase) {
  const expectedOrder = [
    "draw-click",
    "spell-centered-start",
    "spell-centered-end",
    "old-gabar-pulse-start",
    "old-gabar-pulse-end",
    "old-gabar-removed",
    "new-gabar-arrival-start",
    "new-gabar-arrival-end",
    "resolution-message",
    "draw-action-complete"
  ];
  const timelineTypes = evidence.gabarTimeline.map(item => item.type);
  const indexes = expectedOrder.map(type => timelineTypes.indexOf(type));
  expect(indexes.every(index => index >= 0), JSON.stringify({timelineTypes})).toBe(true);
  expect(indexes).toEqual([...indexes].sort((a, b) => a - b));

  const drawClick = firstTimelineEvent(evidence, "draw-click");
  expect(drawClick.board).toContain(testCase.oldGabar);
  expect(drawClick.deck).toContain(testCase.spell);
  expect(drawClick.hand).not.toContain(testCase.newGabar);
  expect(drawClick.notifications).toEqual([]);

  const centered = firstTimelineEvent(evidence, "spell-centered-start");
  expect(centered.className).toContain("batch02-gabar-spell-presentation");
  expect(centered.deck).not.toContain(testCase.spell);
  expect(centered.board).toContain(testCase.oldGabar);
  expect(centered.hand).not.toContain(testCase.newGabar);
  expect(centered.notifications).toEqual([]);
  expect(centered.rect?.width).toBeGreaterThan(80);
  expect(centered.rect?.height).toBeGreaterThan(100);
  expect(Math.abs(centered.rect.cx - centered.viewport.cx)).toBeLessThan(centered.viewport.width * 0.18);
  expect(Math.abs(centered.rect.cy - centered.viewport.cy)).toBeLessThan(centered.viewport.height * 0.18);

  const pulse = firstTimelineEvent(evidence, "old-gabar-pulse-start");
  expect(pulse.board).toContain(testCase.oldGabar);
  expect(pulse.hand).not.toContain(testCase.newGabar);
  expect(pulse.notifications).toEqual([]);

  const removed = firstTimelineEvent(evidence, "old-gabar-removed");
  expect(removed.board).not.toContain(testCase.oldGabar);
  expect(removed.hand).not.toContain(testCase.newGabar);
  expect(removed.notifications).toEqual([]);

  const arrival = firstTimelineEvent(evidence, "new-gabar-arrival-start");
  expect(arrival.board).not.toContain(testCase.oldGabar);
  if (testCase.destination === "deck-top") {
    expect(arrival.deck.at(-1)).toBe(testCase.newGabar);
    expect(arrival.hand).not.toContain(testCase.newGabar);
  } else {
    expect(arrival.hand).toContain(testCase.newGabar);
  }
  expect(arrival.notifications).toEqual([]);

  const message = firstTimelineEvent(evidence, "resolution-message");
  expect(message.text).toBe(testCase.message);
  expect(message.notifications).toEqual([testCase.message]);
  expect(message.currentPlayer).toBe(drawClick.currentPlayer);
  expect(message.turnSequence).toBe(drawClick.turnSequence);
  expect(message.nextTurnCalls).toBe(0);
}

function expectGabarSpellPortraitPresentation(evidence, testCase) {
  const card = firstTimelineEvent(evidence, "spell-card-visible");
  expect(card, JSON.stringify({timeline:evidence.gabarTimeline.map(item => item.type)})).toBeTruthy();
  expect(card.cardId).toBe(testCase.spell);
  expect(card.className).toContain("sort-fc");
  expect(card.title).toBe(card.expectedTitle);
  expect(card.title).toBeTruthy();
  expect(card.descriptionText).toContain(card.expectedDescriptionText.slice(0, Math.min(28, card.expectedDescriptionText.length)));
  expect(card.costText).toBe(card.expectedCostText);
  expect(card.imageSrc).toContain(`${testCase.spell}.png`);
  expect(card.rect.height).toBeGreaterThan(card.rect.width);
  expect(card.rect.height / card.rect.width).toBeGreaterThanOrEqual(1.35);
  expect(card.rect.height).toBeGreaterThan(500);
  expect(Math.abs(card.rect.cx - card.viewport.cx)).toBeLessThan(card.viewport.width * 0.05);
  expect(Math.abs(card.rect.cy - card.viewport.cy)).toBeLessThan(card.viewport.height * 0.05);
  expect(card.forbiddenText).toBe(false);
  expect(card.hasAttackNode).toBe(false);
  expect(card.hasHealthNode).toBe(false);
  expect(card.hasPrepareBadge).toBe(false);
}

async function gabarCycleState(page) {
  return page.evaluate(() => {
    const cards = player => ({
      hand:playerHand(player).map(getRuntimeCardId),
      deck:playerDrawPile(player).map(getRuntimeCardId),
      graveyard:player.graveyard.map(getRuntimeCardId),
      board:livingServantCardsForPlayer(player).map(fc => fc.dataset.id),
      resources:JSON.parse(JSON.stringify(player.resourceState || {}))
    });
    return {
      scenario:selectedScenarioId(),
      url:location.href,
      currentPlayer,
      turnSequence,
      actionsLeft:player1.actionsLeft ?? null,
      player1:cards(player1),
      player2:cards(player2),
      notification:document.querySelector("#notif")?.textContent || "",
      evidence:window.__batch15d4Evidence || {gabarTimeline:[], notifications:[]},
      drawTrace:[...(window.__drawTraceHistory || [])].slice(-20),
      nextTurnCalls:window.__batch15d4NextTurnCalls || 0
    };
  });
}

async function expectSingleScenarioInitialState(page) {
  const initial = await gabarCycleState(page);
  expect(initial.scenario).toBe("collection-batch-15d-gabar-cycle");
  expect(new URL(initial.url).searchParams.get("case")).toBeNull();
  expect(initial.player1.hand).toEqual(["H000032"]);
  expect(initial.player1.deck).toEqual([]);
  expect(initial.player1.graveyard).toEqual([]);
  expect(initial.player1.board).toEqual([]);
  expect([...initial.player1.hand, ...initial.player1.deck, ...initial.player1.graveyard, ...initial.player1.board]
    .some(id => ["H000033","H000034","H000035","H000036","S000057","S000058","S000059","S000060"].includes(id))).toBe(false);
  return initial.player2;
}

function expectPlayer2Unchanged(current, baseline) {
  expect(current.player2.hand).toEqual(baseline.hand);
  expect(current.player2.deck).toEqual(baseline.deck);
  expect(current.player2.graveyard).toEqual(baseline.graveyard);
  expect(current.player2.board).toEqual(baseline.board);
  expect(current.player2.resources).toEqual(baseline.resources);
}

async function playGabarAndExpectInitiative(page, gabarId, spellId, player2Baseline) {
  await clearGabarPreClickNotifications(page);
  await dragHandCardToSelector(page, gabarId, "#yriaServants .slot", 2500);
  const afterInitiative = await gabarCycleState(page);
  expect(afterInitiative.player1.board).toContain(gabarId);
  expect(afterInitiative.player1.deck.at(-1)).toBe(spellId);
  expect(afterInitiative.player1.hand).not.toContain(spellId);
  expect(afterInitiative.player1.hand).not.toContain(gabarId);
  expect(afterInitiative.evidence.notifications.map(item => item.text).filter(Boolean).some(text => text.includes("GABAR"))).toBe(false);
  expectPlayer2Unchanged(afterInitiative, player2Baseline);
}

async function drawEvolutionAndExpectChronology(page, step, player2Baseline) {
  await clearGabarPreClickNotifications(page);
  const before = await gabarCycleState(page);
  expect(before.player1.deck.at(-1)).toBe(step.spell);
  expect(before.player1.board).toContain(step.oldGabar);
  expect(before.player1.hand).not.toContain(step.newGabar);
  const clickInfo = await clickPlayer1DeckAtVisibleCenter(page);
  expect(clickInfo.topElement.closestPlayer1Deck, JSON.stringify(clickInfo)).toBe(true);
  const resolution = await waitForLastGabarDrawPromise(page);
  expect(resolution.evolutionResolution?.success).toBe(true);
  const after = await gabarCycleState(page);
  expect(after.player1.board).not.toContain(step.oldGabar);
  expect(after.player1.hand).toContain(step.newGabar);
  expect(after.player1.deck).not.toContain(step.spell);
  expect(after.player1.graveyard).not.toContain(step.spell);
  expect(after.notification).toBe(step.message);
  expect(after.evidence.notifications.map(item => item.text)).toEqual([step.message]);
  expect(after.evidence.notifications.some(item => item.text.startsWith("SORT JOUÉ :"))).toBe(false);
  expectGabarIntermediatePhases(after.evidence, {...step, destination:"hand"});
  expectGabarSpellPortraitPresentation(after.evidence, step);
  expectPlayer2Unchanged(after, player2Baseline);
}

function expectFrenchNoBreakSpaces(text) {
  expect(text).not.toMatch(/ [:\;\?\!»]/);
  expect(text).not.toMatch(/« /);
  expect(text).not.toContain("&nbsp;");
}

function transferCount(result, transferName) {
  return new Set(result.observed
    .filter(event => event.dataset.batch15dTransfer === transferName)
    .map(event => event.dataset.batch15dTransferSeq || `${event.dataset.batch15dCardId}-${event.dataset.batch15dSourceZone}-${event.dataset.batch15dTransfer}`)).size;
}

function expectOwnerGeometry(transfer, expectedTransfer, expectedZone) {
  expect(transfer?.dataset?.batch15dTransfer).toBe(expectedTransfer);
  expect(transfer?.dataset?.batch15dSourceZone).toBe(expectedZone);
  expect(transfer?.distanceToOwner).not.toBeNull();
  expect(transfer?.distanceToOpponent).not.toBeNull();
  expect(transfer.distanceToOwner).toBeLessThan(80);
  expect(transfer.distanceToOpponent).toBeGreaterThan(transfer.distanceToOwner + 120);
}

test("S000009 uses owner deck transfers, alternate branches and no-break punctuation", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000009");
  const result = await state(page);
  expect(result.notification).toBe("LA RÉUNION EST UN SUCCÈS ! LES GOBELINS AFFLUENT DE TOUS CÔTÉS !");
  expectFrenchNoBreakSpaces(result.notification);
  expect(result.board.filter(id => id.startsWith("GOB"))).toEqual(["GOB000002", "GOB000001", "GOB000002"]);
  expect(transferCount(result, "deck-to-board")).toBe(3);
  expect(result.observed.filter(event => event.dataset.batch15dTransfer === "deck-to-board").every(event => event.dataset.batch15dSourceOwner === "player1")).toBe(true);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-none");
  await playSpellFromHand(page, "S000009");
  const none = await state(page);
  expect(none.notification).toBe("LES GOBELINS N'ONT JAMAIS ÉTÉ CONNUS POUR LEUR FIABILITÉ. AUCUN N'EST VENU !");
  expectFrenchNoBreakSpaces(none.notification);
  expect(transferCount(none, "deck-to-board")).toBe(0);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const one = await state(page);
  expect(one.notification).toBe("UN SEUL GOBELIN A RÉPONDU À L'APPEL. LES AUTRES SE SONT PEUT-ÊTRE PERDUS EN CHEMIN ?");
  expectFrenchNoBreakSpaces(one.notification);
  expect(transferCount(one, "deck-to-board")).toBe(1);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000009 summit-one starts from the caster deck and never creates a seventh servant slot", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const evidence = await page.evaluate(() => window.__batch15d4Evidence);
  const transfer = evidence.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-board");
  expectOwnerGeometry(transfer, "deck-to-board", "deck");
  const player1MaxSlots = Math.max(...evidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count));
  expect(player1MaxSlots).toBeLessThanOrEqual(6);
  await attachDiagnostics(testInfo, diagnostics);
  await testInfo.attach("s000009-source-geometry", {contentType:"application/json", body:Buffer.from(JSON.stringify({transfer, slotCounts:evidence.slotCounts}, null, 2), "utf8")});
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("generic spell drops add no servant slot and servant drops still use a real slot", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-one");
  await playSpellFromHand(page, "S000009");
  const spellEvidence = await page.evaluate(() => window.__batch15d4Evidence);
  expect(Math.max(...spellEvidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count))).toBeLessThanOrEqual(6);

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=summit-none");
  await page.evaluate(() => {
    player1.hand = ["H000001"];
    player1.servants = [];
    refreshRuntimeZone(player1, "hand");
    refreshRuntimeZone(player1, "servants");
    window.__batch15d4Evidence.slotCounts = [];
  });
  await dragHandCardToSelector(page, "H000001", "#yriaServants .slot");
  const servant = await state(page);
  const servantEvidence = await page.evaluate(() => window.__batch15d4Evidence);
  expect(servant.board).toContain("H000001");
  expect(Math.max(...servantEvidence.slotCounts.filter(item => item.playerKey === "player1").map(item => item.count))).toBeLessThanOrEqual(6);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000013 highlights upgraded Nains in board, hand and deck with the exact Batch 15D2 message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000013");
  const result = await state(page);
  expect(result.notification).toBe("L'EXPÉRIENCE DU COMBAT CHANGE LES SIMPLES GUERRIERS EN REDOUTABLES VÉTÉRANS ET COMBATTANTS D'ÉLITE !");
  expect(result.board).toContain("N000008");
  expect(result.hand).toContain("N000008");
  expect(result.deck).toContain("N000008");
  expect(result.observed.some(event => event.dataset.batch15dNainPulse === "board")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dHandHalo === "N000008")).toBe(true);
  expect(result.observed.some(event => event.dataset.batch15dDeckPulse === "N000008")).toBe(true);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000014 uses the full active Orc pool, maxOwned 2, no generated Initiative, and exact message", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000014");
  const result = await state(page);
  const summonedOrcs = result.board.filter(id => id.startsWith("ORC"));
  const allowedOrcs = new Set(["ORC000001", "ORC000002", "ORC000004", "ORC000005", "ORC000008", "ORC000009", "ORC000013", "ORC000017"]);
  expect(result.notification).toBe("AUCUNE TRIBU ORC NE PEUT RÉSISTER À L'APPEL D'UN PILLAGE FACILE ET SANGLANT !");
  expect(result.runtimeMaxS000014).toBe(2);
  expect(summonedOrcs.every(id => allowedOrcs.has(id))).toBe(true);
  expect(result.observed.some(event => /initiative/i.test(`${event.className} ${event.text}`))).toBe(false);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 and S000052 expose source-specific transfers and exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants");
  await playSpellFromHand(page, "S000023");
  const pacte = await state(page);
  expect(pacte.notification).toBe("UN REJETON DU TISSEUR DE GIVRE RÉPOND À VOTRE APPEL !");
  expect(pacte.observed.some(event => event.dataset.batch15dTransfer === "hand-to-board")).toBe(true);

  await openBatch15DScenario(page, "collection-batch-15d-revenants-deck");
  await playSpellFromHand(page, "S000052");
  const revenants = await state(page);
  expect(revenants.notification).toBe("UN SOMBRE RITUEL RAPPELLE DES SERVITEURS DE LA TOMBE !");
  expect(revenants.observed.filter(event => event.dataset.batch15dTransfer === "deck-to-board").every(event => event.dataset.batch15dSourceOwner === "player1")).toBe(true);
  expect(transferCount(revenants, "deck-to-board")).toBe(3);

  await openBatch15DScenario(page, "collection-batch-15d-revenants-echo");
  await playSpellFromHand(page, "S000052");
  const echo = await state(page);
  expect(echo.notification).toBe("UN SOMBRE RITUEL PUISE DANS LES ÂMES DES DISPARUS ET EN TIRE DE L'ÉCHO À OUTRANCE !");
  expectFrenchNoBreakSpaces(echo.notification);
  expect(transferCount(echo, "deck-to-board")).toBe(0);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000023 and S000052 positive branches start from the caster deck or graveyard geometry", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);

  await openBatch15DScenario(page, "collection-batch-15d-pact-revenants", "&case=pact-deck");
  await playSpellFromHand(page, "S000023");
  const pactDeck = await page.evaluate(() => window.__batch15d4Evidence);
  const dragonTransfer = pactDeck.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-hand");
  expectOwnerGeometry(dragonTransfer, "deck-to-hand", "deck");

  await openBatch15DScenario(page, "collection-batch-15d-revenants-deck");
  await playSpellFromHand(page, "S000052");
  const revenantsDeck = await page.evaluate(() => window.__batch15d4Evidence);
  const deckTransfer = revenantsDeck.transfers.find(item => item.dataset.batch15dTransfer === "deck-to-board");
  expectOwnerGeometry(deckTransfer, "deck-to-board", "deck");

  await openBatch15DScenario(page, "collection-batch-15d-revenants-graveyard");
  await playSpellFromHand(page, "S000052");
  const revenantsGraveyard = await page.evaluate(() => window.__batch15d4Evidence);
  const graveyardTransfer = revenantsGraveyard.transfers.find(item => item.dataset.batch15dTransfer === "graveyard-to-board");
  expectOwnerGeometry(graveyardTransfer, "graveyard-to-board", "graveyard");

  await attachDiagnostics(testInfo, diagnostics);
  await testInfo.attach("source-geometry", {contentType:"application/json", body:Buffer.from(JSON.stringify({dragonTransfer, deckTransfer, graveyardTransfer}, null, 2), "utf8")});
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("S000038, S000047 and the unique Gabar cycle use the exact Batch 15D2 messages", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-replacement");
  await playSpellFromHand(page, "S000038");
  const codeCouleurs = await state(page);
  expect(codeCouleurs.notification).toBe("VOUS CONNAISSEZ L'EXPRESSION, « DERRIÈRE CHAQUE GOBELIN S'EN CACHE UN ENCORE PLUS RETORS ? »");
  expect(transferCount(codeCouleurs, "copy-to-hand")).toBe(2);

  await openBatch15DScenario(page, "collection-batch-15d-invocation");
  await playSpellFromHand(page, "S000047");
  const volee = await state(page);
  expect(volee.notification).toBe("ATTENTION ! LES GOBELINS ONT ENVOYÉ DES SURINEURS TRANCHER DES TENDONS ET EXPOSER DES ENTRAILLES !");

  await openBatch15DScenario(page, "collection-batch-15d-invocation", "&case=volley-none");
  await playSpellFromHand(page, "S000047");
  const volleyNone = await state(page);
  expect(volleyNone.notification).toBe("DES GOBELINS ONT BIEN ÉTÉ CATAPULTÉS QUELQUE PART, MAIS APPAREMMENT PAS SUR LE CHAMP DE BATAILLE. OUPS !");
  expect(transferCount(volleyNone, "generated-to-board")).toBe(0);

  await openBatch15DScenario(page, "collection-batch-15d-gabar-cycle");
  await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page, "H000032", "S000057", (await gabarCycleState(page)).player2);
  await drawEvolutionAndExpectChronology(page, {
    oldGabar:"H000032",
    spell:"S000057",
    newGabar:"H000033",
    message:"AVEC L'AUBE DE SOIE DE LUMIÈRE, GABAR PREND CONFIANCE !"
  }, (await gabarCycleState(page)).player2);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

test("15D8 unique Gabar scenario plays the complete H000032 to H000036 cycle without reload", async ({page}, testInfo) => {
  const diagnostics = attachPageDiagnostics(page);
  await openBatch15DScenario(page, "collection-batch-15d-gabar-cycle");
  const player2Baseline = await expectSingleScenarioInitialState(page);
  const initialUrl = await page.evaluate(() => location.href);
  await installGabarReadableTiming(page, testInfo);
  await installGabarArtworkAudit(page);
  await installStrictGabarChronology(page);
  const steps = [
    {
      oldGabar:"H000032",
      spell:"S000057",
      newGabar:"H000033",
      message:"AVEC L'AUBE DE SOIE DE LUMIÈRE, GABAR PREND CONFIANCE !"
    },
    {
      oldGabar:"H000033",
      spell:"S000058",
      newGabar:"H000034",
      message:"LE GRIMOIRE MAGIQUE DU MAÎTRE N'A PLUS DE SECRETS POUR GABAR !"
    },
    {
      oldGabar:"H000034",
      spell:"S000059",
      newGabar:"H000035",
      message:"L'APPRENTISSAGE DE GABAR SE TERMINE AVEC L'OBTENTION DE SA PROPRE PLUME ENCHANTÉE !"
    },
    {
      oldGabar:"H000035",
      spell:"S000060",
      newGabar:"H000036",
      message:"DÉSORMAIS PARFAITEMENT ÉQUIPÉ ET INSTRUIT, GABAR DEVIENT UN MAÎTRE-MAGICIEN ET UN INVOCATEUR DE RENOM."
    }
  ];
  for (const step of steps) {
    await playGabarAndExpectInitiative(page, step.oldGabar, step.spell, player2Baseline);
    await drawEvolutionAndExpectChronology(page, step, player2Baseline);
    const artwork=await page.evaluate(id=>window.__gabarArtworkAudit.find(item=>item.spell===id),step.spell);
    expectGabarArtworkCoverage(artwork);
    await testInfo.attach(`${step.spell}-artwork-coverage`,{contentType:'application/json',body:Buffer.from(JSON.stringify(artwork,null,2))});
    const timing = await page.evaluate(id => window.__gabarReadableTimings.find(item => item.cardId === id), step.spell);
    console.log("GABAR_TIMING_RESULT " + JSON.stringify(timing));
    await testInfo.attach(`${step.spell}-timing`, {contentType:"application/json", body:Buffer.from(JSON.stringify(timing,null,2))});
    expect(timing.samples.length).toBeGreaterThan(0);
    expect(timing.violations).toEqual([]);
    expect(timing.lockDuringAllFrames).toBe(true);
    const childEnd = timing.animationEvents.find(event => event.animation === 'zoomIn');
    expect(childEnd).toBeTruthy();
    expect(timing.removedAt-childEnd.at).toBeGreaterThan(2200);
    expect(timing.exitAt-timing.insertedAt, "entry is included in the 2.5-second presentation").toBeGreaterThanOrEqual(2450);
    expect(timing.exitAt-timing.insertedAt).toBeLessThanOrEqual(2650);
    expect(timing.readableMs).toBeGreaterThanOrEqual(2150);
    expect(timing.readableMs).toBeLessThanOrEqual(2500);
    expect(timing.totalMs).toBeGreaterThan(timing.readableMs);
    expect(timing.totalMs).toBeLessThan(2800);
    expect(timing.exitAt).toBeGreaterThan(timing.readableAt);
    expect(timing.removedAt).toBeGreaterThan(timing.exitAt);
    const timeline = (await gabarCycleState(page)).evidence.gabarTimeline;
    const message = timeline.find(item => item.type === 'resolution-message-shown');
    const unlock = timeline.find(item => item.type === 'resolution-lock-released');
    expect(message.gabarLocked).toBe(true);
    expect(unlock.gabarLocked).toBe(false);
    expect(unlock.at).toBeGreaterThanOrEqual(message.at);
    expect(await page.evaluate(() => location.href)).toBe(initialUrl);
  }
  await clearGabarPreClickNotifications(page);
  await dragHandCardToSelector(page, "H000036", "#yriaServants .slot", 2500);
  const terminal = await gabarCycleState(page);
  expect(terminal.player1.board).toContain("H000036");
  expect(terminal.player1.deck.filter(id => ["S000057","S000058","S000059","S000060"].includes(id))).toEqual([]);
  expect(terminal.evidence.notifications.map(item => item.text).filter(Boolean)).toEqual([]);
  expectPlayer2Unchanged(terminal, player2Baseline);
  expect(await page.evaluate(() => location.href)).toBe(initialUrl);
  const strict=await strictGabarEvidence(page,testInfo,'all-four-strict-chronologies');
  expect(strict.map(group=>group.spell)).toEqual(['S000057','S000058','S000059','S000060']);
  await attachDiagnostics(testInfo, diagnostics);
  expect(blockingConsoleErrors(diagnostics)).toEqual([]);
});

async function waitReadableGabar(page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('.batch02-gabar-spell-presentation');
    return node?.dataset.batch02GabarStage === 'spell-centered-readable' && Number(getComputedStyle(node).opacity) === 1;
  });
}

test('15D8C zoomIn child and unrelated animationend cannot close the real reveal', async ({page}) => {
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent = await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await waitReadableGabar(page);
  await page.evaluate(() => {
    const overlay = document.querySelector('.batch02-gabar-spell-presentation');
    overlay.querySelector('.fc-zoom').dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'zoomIn'}));
    overlay.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'zoomIn'}));
    overlay.dispatchEvent(new AnimationEvent('animationend',{bubbles:true,animationName:'unrelated-exit'}));
  });
  await page.waitForTimeout(250);
  await expect(page.locator('.batch02-gabar-spell-presentation')).toBeVisible();
  expect(await page.evaluate(() => gabarEvolutionResolutionInProgress)).toBe(true);
  await waitForLastGabarDrawPromise(page);
  await expect(page.locator('.batch02-gabar-spell-presentation')).toHaveCount(0);
  expect(await page.evaluate(() => gabarEvolutionResolutionInProgress)).toBe(false);
});

for (const fullHand of [false,true]) test(`15D8C input lock ${fullHand ? 'full hand' : 'normal'} blocks real actions and restores controls`, async ({page},testInfo) => {
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent = await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  if (fullHand) await page.getByTestId('batch15d-gabar-cycle-full-hand').click();
  await installStrictGabarChronology(page);
  await collapseTestPanelIfVisible(page);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await waitReadableGabar(page);
  const snapshot = () => page.evaluate(() => ({currentPlayer,turnSequence,
    hand:playerHand(player1).map(getRuntimeCardId),deck:playerDrawPile(player1).map(getRuntimeCardId),
    board:livingServantCardsForPlayer(player1).map(fc=>fc.dataset.id),
    resources:JSON.parse(JSON.stringify(player1.resourceState)),
    events:collectionBatch02State.events.filter(event=>event.type==='evolution'),
    notification:document.querySelector('#notif').textContent,
    transition:turnTransitionInProgress,locked:gabarEvolutionResolutionInProgress}));
  const before = await snapshot();
  const end = await page.locator('#btnEndTurn').boundingBox();
  await page.mouse.click(end.x+end.width/2,end.y+end.height/2);
  await clickPlayer1DeckAtVisibleCenter(page);
  await page.keyboard.press('Enter');
  let handAttempted = false;
  if (fullHand) {
    const source = await page.locator('.hc[data-player="player1"]').last().boundingBox();
    const target = await page.locator('#yriaServants .slot').first().boundingBox();
    expect(source).toBeTruthy();
    await page.mouse.move(source.x+source.width/2,source.y+source.height/2);
    await page.mouse.down();
    await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});
    await page.mouse.up();
    handAttempted = true;
  }
  expect(await snapshot()).toEqual(before);
  await expect(page.locator('.batch02-gabar-spell-presentation')).toBeVisible();
  const result = await waitForLastGabarDrawPromise(page);
  expect(result.evolutionResolution.destination).toBe(fullHand ? 'deck-top' : 'hand');
  expect(await page.evaluate(() => gabarEvolutionResolutionInProgress)).toBe(false);
  await strictGabarEvidence(page,testInfo,fullHand?'strict-full-hand':'strict-normal-lock');
  const resolved = await gabarCycleState(page);
  expect(resolved.player1.board).not.toContain('H000032');
  expect(resolved.player1.hand).not.toContain('S000057');
  if (fullHand) expect(resolved.player1.deck.at(-1)).toBe('H000033');
  else expect(resolved.player1.hand).toContain('H000033');
  await page.waitForTimeout(200);
  const noQueue = await gabarCycleState(page);
  expect(noQueue.currentPlayer).toBe(resolved.currentPlayer);
  expect(noQueue.turnSequence).toBe(resolved.turnSequence);
  expect(noQueue.player1.hand).toEqual(resolved.player1.hand);
  expect(noQueue.player1.deck).toEqual(resolved.player1.deck);
  await page.mouse.click(end.x+end.width/2,end.y+end.height/2);
  await expect.poll(() => page.evaluate(() => currentPlayer),{timeout:10000}).not.toBe(before.currentPlayer);
  await testInfo.attach('lock-evidence',{contentType:'application/json',body:Buffer.from(JSON.stringify({fullHand,handAttempted,before,resolved,noQueue},null,2))});
});

for (const failure of ['animation-cancelled','overlay-removed']) test(`15D8C lock releases on ${failure}`,async ({page}) => {
  await openBatch15DScenario(page,'collection-batch-15d-gabar-cycle');
  const opponent = await expectSingleScenarioInitialState(page);
  await playGabarAndExpectInitiative(page,'H000032','S000057',opponent);
  await clearGabarPreClickNotifications(page);
  await clickPlayer1DeckAtVisibleCenter(page);
  await page.evaluate(failure => {
    const node = document.querySelector('.batch02-gabar-spell-presentation');
    if (failure === 'overlay-removed') node.remove();
    else node.getAnimations().find(animation=>animation.id==='gabar-spell-entry').cancel();
  },failure);
  const rejected = await page.evaluate(async () => {
    try {await window.__batch15d6LastGabarDrawPromise; return false;} catch {return true;}
  });
  expect(rejected).toBe(true);
  expect(await page.evaluate(() => gabarEvolutionResolutionInProgress)).toBe(false);
  await expect(page.locator('.batch02-gabar-spell-presentation')).toHaveCount(0);
  const end = await page.locator('#btnEndTurn').boundingBox();
  await page.mouse.click(end.x+end.width/2,end.y+end.height/2);
  expect(await page.evaluate(() => turnTransitionInProgress)).toBe(true);
});
