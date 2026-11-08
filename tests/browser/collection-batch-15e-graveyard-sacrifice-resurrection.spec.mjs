import {expect,test} from '@playwright/test';
import {attachDiagnostics,attachPageDiagnostics} from './helpers/eloron-ui.mjs';
test.setTimeout(90000);
const graveyardScenario='collection-batch-15e-graveyard';
const sacrificeScenario='collection-batch-15e-sacrifice';
const theftScenario='collection-batch-15e-resurrection-theft';
const ids=['S000015','S000022','S000026','S000040','S000041','S000051','S000055','S000056'];

async function boot(page,setup={},scenario=graveyardScenario){
 await page.addInitScript(()=>{const values=[0,.1,0];let i=0;const native=Math.random.bind(Math);Math.random=()=>i<values.length?values[i++]:native();});
 await page.goto('/code/partie-test-1.html?scenario='+scenario);
 expect(await page.evaluate(()=>selectedScenarioId())).toBe(scenario);
 await page.waitForFunction(()=>document.querySelector('#btnEndTurn')?.classList.contains('vis')&&!turnTransitionInProgress);
 await page.evaluate(setup=>{
  window.__mythesRandom=()=>0;
  for(const p of [player1,player2]){
   const input=setup[p.key]||{};
   p.hand=input.hand||[];p.drawPile=input.deck||[];p.graveyard=input.graveyard||[];
   p.batch03HandOccurrences=[];p.startingDeckCardIds=input.startingDeck||[];
   p.resourceState.classical={aria:100,lenya:100,selene:100,fer:100,bois:100,pierre:100,nourriture:100};
   p.resourceState.souls=input.souls??20;p.resourceState.revision++;
   if(!(p.supplies||[]).some(supply=>supply.cardId==='R000020')){
    const supplyZone=qs(playerZoneSelector(p,'appro')),slot=supplyZone?.querySelector('.slot-appro');
    if(slot){slot.outerHTML=buildFC('R000020',p.key);registerSupplyInstance(p,supplyZone.querySelector('.fc[data-id="R000020"]'));}
   }
   for(const supply of p.supplies||[]){
    const vector=input.classical?{...createEmptyClassicalResources(),...input.classical}:createCheatCollectorVector(100);
    supply.currentProduction={...vector};supply.productionState||={};supply.productionState.currentVector={...vector};
   }
   projectSoulState(p);recomputeClassicalResources(p);
   const zone=qs(playerZoneSelector(p,'servants'));
   zone.innerHTML=Array.from({length:6},()=>'<div class="slot" data-player="'+p.key+'"></div>').join('');
   for(const entry of input.board||[]){
    const slot=zone.querySelector('.slot');slot.outerHTML=buildFC(entry.id,p.key);
    const fc=[...zone.querySelectorAll('.fc')].at(-1);
    if(entry.instance)fc.dataset.instance=entry.instance;
    if(entry.atk!==undefined||entry.pdv!==undefined||entry.pdvMax!==undefined)batch03UpdateStats(fc,{atk:entry.atk??Number(fc.dataset.atk),pdv:entry.pdv??Number(fc.dataset.pdv),pdvMax:entry.pdvMax??Number(fc.dataset.pdvMax)});
    Object.assign(fc.dataset,entry.flags||{});fc.removeAttribute('data-new');fc.querySelector('.fc-new-badge')?.remove();
   }
   refreshRuntimeZone(p,'hand');refreshRuntimeZone(p,'deck');refreshRuntimeZone(p,'graveyard');
  }
  currentPlayer=player1.key;activePlayer=player1;cardsPlayedThisTurn=0;
  const notification=document.querySelector('#notif');if(notification)notification.textContent='';
  const error=document.querySelector('#errMsg');if(error)error.textContent='';
  document.querySelector('[data-testid="test-resource-panel-collapse"]')?.click();
  window.__batch15eUIActions=[];
  window.__batch15eFlights=[];
  new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes){if(node.nodeType===1&&node.dataset.batch15eTransfer)window.__batch15eFlights.push({...node.dataset,animated:node.getAnimations().length>0});}}).observe(document.body,{childList:true,subtree:true});
  const original=playCard;
  playCard=function(...args){
   const action={cardId:args[0],done:false};window.__batch15eUIActions.push(action);
   const promise=original.apply(this,args);window.__batch15eLastAction=action;
   Promise.resolve(promise).then(result=>{action.done=true;action.success=result?.success;action.reason=result?.reason;},error=>{action.done=true;action.error=String(error);action.errorStack=error?.stack;});
   return promise;
  };
 },setup);
}

async function playUI(page,cardId){
 await expect(page.locator('.hc[data-id="'+cardId+'"]').first()).toBeVisible();
 const before=await page.evaluate(()=>window.__batch15eUIActions.length);
 await page.evaluate(cardId=>{
  const card=document.querySelector('.hand-j1 .hc[data-id="'+cardId+'"]')||document.querySelector('.hc[data-id="'+cardId+'"]');
  const target=CARDS_DATA[cardId].type==='Serviteur'?qs(playerZoneSelector(player1,'servants')+' .slot'):document.querySelector('.board-bg'),transfer=new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));
  card.dispatchEvent(new DragEvent('dragend',{bubbles:true,cancelable:true,dataTransfer:transfer}));
 },cardId);
 await expect.poll(()=>page.evaluate(()=>window.__batch15eUIActions.length)).toBeGreaterThan(before);
}
async function settled(page){await page.waitForFunction(()=>window.__batch15eLastAction?.done);expect(await page.evaluate(()=>window.__batch15eLastAction?.error)).toBeUndefined();}
async function state(page){return page.evaluate(()=>{
 const summarize=p=>({hand:playerHand(p).map(getRuntimeCardId),handOccurrences:[...ensureBatch03HandOccurrences(p)],deck:playerDrawPile(p).map(getRuntimeCardId),graveyard:p.graveyard.map(getRuntimeCardId),board:livingServantCardsForPlayer(p).map(targetSummary),souls:p.resourceState.souls});
 return {player1:summarize(player1),player2:summarize(player2),plays:cardsPlayedThisTurn,message:document.querySelector('#notif')?.textContent||'',error:document.querySelector('#errMsg')?.textContent||'',actions:window.__batch15eUIActions?.map(({cardId,done,reason})=>({cardId,done,reason}))};
});}
async function evidence(page,testInfo,label){const value=await state(page);await testInfo.attach(label,{body:Buffer.from(JSON.stringify(value,null,2)),contentType:'application/json'});return value;}

for(const cardId of ['S000015','S000022'])test(cardId+' UI keeps the spell and its cost until cancellable graveyard selection is confirmed',async({page},testInfo)=>{
 const diagnostics=attachPageDiagnostics(page);
 await boot(page,{player1:{hand:[cardId],graveyard:['H000001','H000005']},player2:{graveyard:['H000001','H000005']}},cardId==='S000022'?theftScenario:graveyardScenario);
 const before=await state(page);await playUI(page,cardId);
 await expect(page.getByTestId('zone-card-choice').first()).toBeVisible();
 const pending=await evidence(page,testInfo,'pending-before-confirmation');
 expect(pending.player1.hand,'opening the graveyard selector must not consume the spell').toEqual(before.player1.hand);
 expect(pending.plays).toBe(before.plays);expect(pending.player1.souls).toBe(before.player1.souls);
 await page.locator('.sort-choice-cancel-button').click();await settled(page);
 const after=await state(page);
 expect(after.player1).toEqual(before.player1);expect(after.player2).toEqual(before.player2);expect(after.plays).toBe(0);
 await attachDiagnostics(testInfo,diagnostics);expect(diagnostics.pageErrors).toEqual([]);
});

test('S000026 UI refuses the oath before payment without ten ice servants in its own graveyard',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000026','H000005'],board:[{id:'H000001'}]}},sacrificeScenario);
 expect(await page.evaluate(()=>getCardAffordabilityResult('S000026',player1).playable),'fixture provides actual registered supplies').toBe(true);
 const before=await state(page);await playUI(page,'S000026');await settled(page);
 const after=await evidence(page,testInfo,'oath-refusal');
 expect(after.player1.hand,'the canonical ten-servant prerequisite must gate the real UI').toEqual(before.player1.hand);
 expect(after.player1.board).toEqual(before.player1.board);expect(after.plays).toBe(0);
 expect(after.error).toMatch(/10|dix/i);
});

test('S000040 UI refuses before consuming Pixiemanie when not all Pixies fit after the spell leaves hand',async({page},testInfo)=>{
 const hand=['S000040',...Array(11).fill('H000001')];
 await boot(page,{player1:{hand,graveyard:['EDB000012','EDB000012']}});
 expect(await page.evaluate(()=>getCardAffordabilityResult('S000040',player1).playable),'fixture provides actual registered supplies').toBe(true);
 const before=await state(page);await playUI(page,'S000040');await settled(page);
 const after=await evidence(page,testInfo,'pixie-capacity-refusal');
 expect(after.player1.hand,'an impossible all-Pixies return must not eat the spell').toEqual(before.player1.hand);
 expect(after.player1.graveyard).toEqual(before.player1.graveyard);expect(after.plays).toBe(0);
 expect(after.error).toMatch(/Pixies|main/i);
});

test('S000041 UI damage honors the marked victim rescue instead of capturing a servant that survived',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000041'],graveyard:['H000005']},player2:{hand:[],board:[{id:'H000001',pdv:1,flags:{batch06DeplacementInstantane:'1',batch06DeplacementSourcePlayer:'player2'}}]}},sacrificeScenario);
 await playUI(page,'S000041');await settled(page);const after=await evidence(page,testInfo,'sacrifice-power-rescue');
 expect(after.player2.hand,'Puissance must use the real damage/death pipeline including rescue').toContain('H000001');
 expect(after.player1.graveyard).toEqual(['S000041']);
});

test('S000051 UI reports an empty enemy graveyard without announcing a theft',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000051']},player2:{graveyard:[]}},theftScenario);
 await playUI(page,'S000051');await settled(page);const after=await evidence(page,testInfo,'empty-ritual');
 expect(after.message).toBe('LE CIMETIÈRE ADVERSE EST VIDE.');
 expect(after.player1.graveyard).toEqual(['S000051']);expect(after.player2.graveyard).toEqual([]);
});

test('S000055 UI sacrifice selection can be cancelled with no departure, reward or payment',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000055'],board:[{id:'H000001'},{id:'H000005'},{id:'H000006'},{id:'H000036'}]}},sacrificeScenario);
 const before=await state(page);await playUI(page,'S000055');
 await expect(page.getByTestId('board-target-choice')).toHaveCount(3);
 await expect(page.locator('.sort-choice-cancel-button'),'sacrifice confirmation needs a real cancellation path').toBeVisible({timeout:1500});
 await page.getByTestId('board-target-choice').nth(0).click();await page.locator('.sort-choice-cancel-button').click();await settled(page);
 const after=await evidence(page,testInfo,'cancelled-sacrifice');
 expect(after.player1).toEqual(before.player1);expect(after.plays).toBe(0);
});

test('S000056 UI single-target selection replaces A with B and can cancel without marking either',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000056'],board:[{id:'H000001'},{id:'H000001'}]}},theftScenario);
 const before=await state(page);await playUI(page,'S000056');
 await page.getByTestId('board-target-choice').nth(0).click();await page.getByTestId('board-target-choice').nth(1).click();
 await expect(page.locator('[data-testid="board-target-choice"].is-selected')).toHaveCount(1);
 await expect(page.getByTestId('board-target-choice').nth(1)).toHaveClass(/is-selected/);
 await expect(page.locator('.sort-choice-cancel-button'),'the mark selector must be cancellable').toBeVisible({timeout:1500});
 await page.locator('.sort-choice-cancel-button').click();await settled(page);
 const after=await evidence(page,testInfo,'cancelled-mark');expect(after.player1).toEqual(before.player1);expect(after.plays).toBe(0);
});

test('S000026 hand text highlights canonical numbers with the Sort charter',async({page})=>{
 await boot(page,{player1:{hand:['S000026']}},sacrificeScenario);
 const strong=page.locator('.hc[data-id="S000026"] strong.kv');
 expect(await strong.count(),'the oath text must highlight its canonical +1 values').toBeGreaterThan(0);
});

test('S000026 UI accepts the canonical Aria alternative without also demanding Lenya',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000026'],graveyard:Array(10).fill('EDG000001'),classical:{aria:5,fer:10}}},sacrificeScenario);
 await playUI(page,'S000026');await settled(page);
 const after=await evidence(page,testInfo,'oath-aria-alternative');
 expect(after.player1.board.map(card=>card.id),'15 total with five Aria is an alternative to five Lenya, not an AND requirement').toContain('EDG000012');
 expect(after.player1.graveyard.filter(id=>id==='S000026')).toHaveLength(1);
});

// Positive cases below derive from Cartes et description rows 271, 278, 282,
// 296, 297, 307, 311 and 312 of the read-only 2026-09-13 export.
async function confirmZones(page,indexes){for(const index of indexes)await page.getByTestId('zone-card-choice').nth(index).click();await page.getByTestId('zone-card-confirm').click();await settled(page);}
async function confirmBoard(page,indexes){for(const index of indexes)await page.getByTestId('board-target-choice').nth(index).click();await page.getByTestId('board-target-confirm').click();await settled(page);}
async function transfers(page){return page.evaluate(()=>({observed:window.__batch15eFlights,events:collectionBatch15EState.events.filter(e=>e.type.startsWith('transfer-')),ghosts:document.querySelectorAll('[data-batch15e-transfer]').length}));}
const entry=(cardId,occurrenceId,originalOwnerId='player1')=>({cardId,occurrenceId,originalOwnerId});

for(const scenario of [graveyardScenario,sacrificeScenario,theftScenario])test('15E hidden scenario and boundary controls '+scenario,async({page},testInfo)=>{
 const diagnostics=attachPageDiagnostics(page);
 await page.goto('/code/partie-test-1.html?scenario='+scenario);
 await page.waitForFunction(()=>document.querySelector('#btnEndTurn')?.classList.contains('vis')&&!turnTransitionInProgress);
 expect(await page.evaluate(()=>({id:selectedScenarioId(),hidden:activeScenario.hidden,plays:cardsPlayedThisTurn}))).toEqual({id:scenario,hidden:true,plays:0});
 const hands=await page.evaluate(()=>playerHand(player1));expect(hands.length).toBeGreaterThan(0);expect(hands.every(id=>ids.includes(id)), 'only the declared 15E cards are offered').toBe(true);
 await expect(page.getByTestId('test-resource-panel-restore')).toBeVisible();
 await page.screenshot({path:testInfo.outputPath('initial-15e.png')});
 await expect(page.getByTestId('test-resource-panel-collapse')).toHaveCount(0);
 for(const variant of ['empty','full-hand','full-board']){
  await page.goto('/code/partie-test-1.html?scenario='+scenario+'&case='+variant);
  await page.waitForFunction(()=>document.querySelector('#btnEndTurn')?.classList.contains('vis')&&!turnTransitionInProgress);
  const zones=await page.evaluate(()=>({hand:playerHand(player1).length,board:livingServantCardsForPlayer(player1).length,cem:player1.graveyard.length,enemy:player2.graveyard.length}));
  if(variant==='empty')expect([zones.cem,zones.enemy]).toEqual([0,0]);
  if(variant==='full-hand')expect(zones.hand).toBe(12);
  if(variant==='full-board')expect(zones.board).toBe(6);
 }
 await attachDiagnostics(testInfo,diagnostics);expect(diagnostics.pageErrors).toEqual([]);
});

test('S000015 UI moves the selected duplicate from its own cemetery, excludes Tisseur, and uses the real source animation',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000015'],graveyard:[entry('H000001','own-a'),entry('H000001','own-b'),'EDG000012','R000010']},player2:{graveyard:[entry('H000001','enemy-a','player2')]}});
 const before=await state(page);await playUI(page,'S000015');
 await expect(page.getByTestId('zone-card-choice')).toHaveCount(2);await expect(page.getByTestId('zone-card-ineligible')).toHaveCount(0);
 await expect(page.getByTestId('batch15e-source-zone')).toHaveCount(0);await expect(page.locator('.sort-choice-cards')).toHaveAttribute('aria-label','Votre cimetière');
 await expect(page.getByTestId('zone-card-choice').nth(1)).toHaveAttribute('data-occurrence-id','own-b');
 await confirmZones(page,[1]);const after=await evidence(page,testInfo,'exact-own-occurrence');
 expect(after.player1.deck).toEqual(['H000001']);expect(after.player1.graveyard).toEqual(['H000001','EDG000012','R000010','S000015']);expect(after.player2).toEqual(before.player2);
 expect(after.plays).toBe(1);expect(after.player1.souls).toBe(before.player1.souls);
 expect(await page.evaluate(()=>batch15EZoneIdentity(player1,'deck',0))).toMatchObject({occurrenceId:'own-b',originalOwnerId:'player1'});
 const fx=await transfers(page);expect(fx.observed).toHaveLength(1);expect(fx.observed[0]).toMatchObject({sourceOwner:'player1',destinationOwner:'player1',sourceZone:'graveyard',destinationZone:'deck',occurrenceId:'own-b',animated:true});expect(fx.ghosts).toBe(0);
 expect(after.message).toBe(e2Messages.survivors);await e2NotificationGeometry(page);
});

test('S000022 UI steals exactly the second duplicate; original owner survives shuffle, draw, real replay and future death',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000022'],classical:{},souls:20},player2:{graveyard:[entry('H000001','enemy-a','player2'),entry('H000001','enemy-b','player2'),'H000036','R000010']}},theftScenario);
 const globalBefore=await page.evaluate(()=>JSON.stringify(CARDS_DATA.H000001));
 await playUI(page,'S000022');await expect(page.getByTestId('zone-card-choice')).toHaveCount(2);await expect(page.getByTestId('zone-card-ineligible')).toHaveCount(0);
 await expect(page.getByTestId('batch15e-source-zone')).toHaveCount(0);await expect(page.locator('.sort-choice-cards')).toHaveAttribute('aria-label','Cimetière adverse');await confirmZones(page,[1]);
 let after=await state(page);expect(after.player2.graveyard).toEqual(['H000001','H000036','R000010']);expect(after.player1.deck).toEqual(['H000001']);expect(after.player1.souls).toBe(12);
 expect(after.message).toBe(e2Messages.gallery);
 expect(await page.evaluate(()=>batch15EZoneIdentity(player1,'deck',0))).toMatchObject({occurrenceId:'enemy-b',originalOwnerId:'player2'});
 await page.evaluate(()=>{drawCardFromRuntimeDeck(player1,{sourceCardId:'15e-follow-up-proof'});for(const supply of player1.supplies){supply.currentProduction=createCheatCollectorVector(100);supply.productionState.currentVector={...supply.currentProduction};}recomputeClassicalResources(player1);});
 await playUI(page,'H000001');await settled(page);
 const provenance=await page.evaluate(()=>{const fc=findBoardCard(player1,'H000001');return {...fc.dataset};});
 expect(provenance).toMatchObject({player:'player1',batch15eOriginalOwner:'player2',batch15eSourceOccurrence:'enemy-b'});
 await page.evaluate(async()=>{const fc=findBoardCard(player1,'H000001');await applyDamage(fc,999);});
 after=await evidence(page,testInfo,'future-death-original-owner');expect(after.player1.graveyard).toEqual(['S000022']);expect(after.player2.graveyard.filter(id=>id==='H000001')).toHaveLength(2);
 expect(await page.evaluate(()=>JSON.stringify(CARDS_DATA.H000001))).toBe(globalBefore);
 const fx=await transfers(page);expect(fx.observed[0]).toMatchObject({sourceOwner:'player2',destinationOwner:'player1',sourceZone:'graveyard',destinationZone:'deck',occurrenceId:'enemy-b',animated:true});expect(fx.ghosts).toBe(0);
});

for(const cardId of ['S000015','S000022'])test(cardId+' UI refuses a stale cemetery selection without cost or wrong-copy movement',async({page})=>{
 await boot(page,{player1:{hand:[cardId],graveyard:['H000001','H000005']},player2:{graveyard:['H000001','H000005']}},cardId==='S000022'?theftScenario:graveyardScenario);
 await playUI(page,cardId);await page.getByTestId('zone-card-choice').nth(0).click();
 await page.evaluate(cardId=>(cardId==='S000022'?player2:player1).graveyard.shift(),cardId);
 await page.getByTestId('zone-card-confirm').click();await settled(page);
 const after=await state(page);expect(after.player1.hand).toEqual([cardId]);expect(after.player1.deck).toEqual([]);expect(after.plays).toBe(0);expect(after.error).toBe('Le cimetière a changé. Recommencez la sélection.');
});

test('S000026 UI respects enemy Insensible, destroys allies, discards hand, and computes the canonical Tisseur bonus after departures',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000026','H000005'],graveyard:Array(10).fill('EDG000001'),board:[{id:'EDG000001'},{id:'H000036'}]},player2:{board:[{id:'H000001'},{id:'H000036'}]}},sacrificeScenario);
 await playUI(page,'S000026');await settled(page);const after=await evidence(page,testInfo,'oath-ui-resolution');
 expect(after.player1.hand).toEqual([]);expect(after.player1.board.map(c=>c.id)).toEqual(['EDG000012']);expect(after.player2.board.map(c=>c.id)).toEqual(['H000036']);expect(after.player2.graveyard).toEqual(['H000001']);
 expect(after.message).toBe(e2Messages.oath);await e2NotificationGeometry(page);
 expect(after.player1.graveyard.filter(id=>id==='EDG000001')).toHaveLength(11);expect(after.player1.graveyard).toEqual(expect.arrayContaining(['H000036','H000005','S000026']));
 const stats=await page.evaluate(()=>{const fc=findBoardCard(player1,'EDG000012');return {atk:Number(fc.dataset.atk),hp:Number(fc.dataset.pdv),max:Number(fc.dataset.pdvMax),base:CARDS_DATA.EDG000012};});
 expect(stats.atk).toBe(stats.base.atk+11);expect(stats.hp).toBe(stats.base.pdv+11);expect(stats.max).toBe(stats.hp);expect(after.plays).toBe(1);
});

test('S000040 UI returns every exact Pixie with clean replay and Initiative only on the real hand play',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000040'],graveyard:[{...entry('EDB000012','pixie-a'),pdv:1,frozen:3,petrified:1,buff:99},{...entry('EDB000012','pixie-b'),pdv:1},'H000001']}});
 const base=await page.evaluate(()=>({...CARDS_DATA.EDB000012}));await playUI(page,'S000040');await settled(page);
 let after=await state(page);expect(after.player1.hand).toEqual(['EDB000012','EDB000012']);expect(after.player1.handOccurrences.sort()).toEqual(['pixie-a','pixie-b']);expect(after.player1.board).toEqual([]);expect(after.player1.graveyard).toEqual(['H000001','S000040']);
 expect(after.message).toBe(e2Messages.pixies);
 const fx=await transfers(page);expect(fx.observed).toHaveLength(2);expect(fx.observed.every(f=>f.sourceOwner==='player1'&&f.destinationOwner==='player1'&&f.sourceZone==='graveyard'&&f.destinationZone==='hand'&&f.animated)).toBe(true);expect(fx.ghosts).toBe(0);
 await playUI(page,'EDB000012');await settled(page);
 const replay=await page.evaluate(()=>livingServantCardsForPlayer(player1).map(fc=>({...fc.dataset})));
 expect(replay.length).toBeGreaterThan(0);for(const fc of replay){expect(Number(fc.pdv)).toBe(base.pdv);expect(Number(fc.pdvMax)).toBe(base.pdv);expect(fc.frozen).toBeUndefined();expect(fc.petrified).toBeUndefined();expect(fc.buff).toBeUndefined();}
 await evidence(page,testInfo,'clean-pixie-replay');
});

test('S000041 UI bypasses Insensible, grants printed-cost victim Echoes once, and exiles only its current cemetery',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000041'],graveyard:['H000005','R000010'],souls:0},player2:{graveyard:['H000006'],board:[{id:'H000001',pdv:1,flags:{insensible:'1',batch15eOriginalOwner:'player1'}}]}},sacrificeScenario);
 const expected=await page.evaluate(()=>batch11bEchoAmountFromPrintedCost('H000001'));
 await playUI(page,'S000041');await settled(page);const after=await evidence(page,testInfo,'echo-capture-once');expect(after.player1.graveyard).toEqual(['S000041']);expect(after.player2.graveyard).toEqual(['H000006']);expect(after.player2.board).toEqual([]);expect(after.player1.souls).toBe(expected);
 expect(await page.evaluate(()=>batch11aCapturedVictims(player1).filter(c=>c.cardId==='H000001'))).toHaveLength(1);expect(after.message).toContain('D’AUTANT'.replace('’',"'"));expect(after.message).toContain(' !');
 expect(await page.evaluate(()=>batch11aCapturedVictims(player1)[0].originalOwnerId)).toBe('player1');
 expect(after.message).toBe("LES ÉCHOS VENGEURS DE VOS SERVITEURS SACRIFIÉS SÈMENT LA MORT CHEZ VOS ENNEMIS ET VOUS RESSOURCENT D'AUTANT !");
});

test('S000051 UI transfers the entire adversary cemetery including duplicate servants, spells and supplies with provenance',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000051'],graveyard:['H000005']},player2:{graveyard:[entry('H000001','ritual-a','player2'),entry('H000001','ritual-b','player2'),'S000056','R000010']}},theftScenario);
 await playUI(page,'S000051');await settled(page);const after=await evidence(page,testInfo,'ritual-whole-cemetery');expect(after.player2.graveyard).toEqual([]);expect(after.player1.graveyard).toEqual(['H000005','H000001','H000001','S000056','R000010','S000051']);expect(after.plays).toBe(1);
 expect(after.message).toBe("LA MAGIE NOIRE DÉPOSSÈDE L'ADVERSAIRE DU CONTENU DE SON CIMETIÈRE... AU BÉNÉFICE DU VÔTRE !");
 const origins=await page.evaluate(()=>[1,2,3,4].map(i=>batch15EZoneIdentity(player1,'graveyard',i)));expect(origins.every(e=>e.originalOwnerId==='player2')).toBe(true);expect(origins.slice(0,2).map(e=>e.occurrenceId)).toEqual(['ritual-a','ritual-b']);
 const fx=await transfers(page);expect(fx.observed).toHaveLength(4);expect(fx.observed.every(f=>f.sourceOwner==='player2'&&f.destinationOwner==='player1'&&f.sourceZone==='graveyard'&&f.destinationZone==='graveyard'&&f.animated)).toBe(true);expect(fx.ghosts).toBe(0);expect(after.message).toContain(' !');
});

test('S000055 UI sacrifices exactly three duplicate occurrences, fires Vengeance once, ignores a rescue mark, rewards once and expires after three future owner turns',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000055'],board:[{id:'H000001',instance:'triangle-a',flags:{batch06DeplacementInstantane:'1',batch06DeplacementSourcePlayer:'player1'}},{id:'H000001',instance:'triangle-b'},{id:'EN000002',instance:'triangle-vengeance'},{id:'H000036',instance:'ineligible'}],souls:0},player2:{board:[{id:'H000005',pdv:30,pdvMax:30}]}},sacrificeScenario);
 await page.evaluate(()=>{window.__vengeances=[];const native=triggerVengeance;triggerVengeance=async function(id,...args){window.__vengeances.push(id);return native.call(this,id,...args);};});
 await playUI(page,'S000055');await expect(page.getByTestId('board-target-choice')).toHaveCount(3);await confirmBoard(page,[0,1,2]);
 const after=await evidence(page,testInfo,'confirmed-sacrifice');expect(after.player1.hand).toEqual([]);expect(after.player1.board.map(c=>c.id).sort()).toEqual(['H000036','MV000024'].sort());expect(after.player1.graveyard.filter(id=>id==='H000001')).toHaveLength(2);expect(after.player1.graveyard).toContain('EN000002');expect(after.player1.souls).toBe(10);
 expect(await page.evaluate(()=>window.__vengeances.filter(id=>id==='EN000002').length)).toBe(1);
 const expiry=await page.evaluate(()=>{const fc=findBoardCard(player1,'MV000024'),values=[Number(fc.dataset.temporaryInsensibleTurns)];resolveBatch02OwnerTurnExpiration(player1);values.push(Number(fc.dataset.temporaryInsensibleTurns));for(let i=0;i<3;i++){turnSequence++;resolveBatch02OwnerTurnExpiration(player2);values.push(Number(fc.dataset.temporaryInsensibleTurns));resolveBatch02OwnerTurnExpiration(player1);values.push(Number(fc.dataset.temporaryInsensibleTurns));}return {values,insensible:fc.dataset.insensible,departures:collectionBatch15EState.events.filter(e=>e.type==='sacrifice').map(e=>e.occurrenceId)};});
 expect(expiry.values).toEqual([3,3,3,2,2,1,1,0]);expect(expiry.insensible).toBeUndefined();expect(expiry.departures).toEqual(['triangle-a','triangle-b','triangle-vengeance']);expect(after.message).toContain('TÉNÈBRES :');expect(after.message).toContain(' !');
 expect(after.message).toBe("TRIANGLE DES TÉNÈBRES : UN GÉANT D'OSSEMENTS APPARAÎT AU MILIEU D'UN TOURBILLON D'ÉCHOS !");
});

test('S000056 UI marks only B, concurrent lethal attempts rescue once, Vengeance fires once, and only that returned occurrence costs zero',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000056','EN000002'],board:[{id:'EN000002',instance:'unmarked'},{id:'EN000002',instance:'marked',flags:{frozen:'2',petrified:'1'}}]},player2:{board:[{id:'H000005',pdv:30,pdvMax:30}]}},theftScenario);
 await playUI(page,'S000056');await page.getByTestId('board-target-choice').nth(0).click();await confirmBoard(page,[1]);
 expect((await state(page)).message).toBe('Déplacement instantané protège ce serviteur de sa prochaine destruction.');
 expect(await page.evaluate(()=>livingServantCardsForPlayer(player1).map(fc=>({id:fc.dataset.instance,mark:fc.dataset.batch06DeplacementInstantane})))).toEqual([{id:'unmarked',mark:undefined},{id:'marked',mark:'1'}]);
 await page.evaluate(async()=>{const fc=document.querySelector('.fc[data-instance="marked"]');window.__vengeances=[];const native=triggerVengeance;triggerVengeance=async function(id,...args){window.__vengeances.push(id);return native.call(this,id,...args);};await Promise.all([tryBatch06DeplacementRescue(fc),tryBatch06DeplacementRescue(fc)]);});
 const costs=await page.evaluate(()=>playerHand(player1).map((id,i)=>({id,occurrenceId:batch03HandOccurrenceAt(player1,i),cost:resolveCardCost({player:player1,cardId:id,context:{handOccurrenceId:batch03HandOccurrenceAt(player1,i)}}).effectiveCost.total})));
 expect(costs.find(c=>c.occurrenceId==='marked')?.cost).toBe(0);expect(costs.find(c=>c.occurrenceId!=='marked')?.cost).toBeGreaterThan(0);expect(await page.evaluate(()=>window.__vengeances.filter(id=>id==='EN000002').length)).toBe(1);
 // Move the actual rescued hand card to the first position using its paired
 // occurrence metadata, then drag it through the normal hand UI.
 await page.evaluate(()=>{const i=ensureBatch03HandOccurrences(player1).indexOf('marked');const id=player1.hand.splice(i,1)[0],occ=player1.batch03HandOccurrences.splice(i,1)[0];player1.hand.unshift(id);player1.batch03HandOccurrences.unshift(occ);refreshHand(player1);});
 await playUI(page,'EN000002');await settled(page);
 const replay=await page.evaluate(()=>({...document.querySelector('.fc[data-instance="marked"]').dataset}));expect(replay.frozen).toBeUndefined();expect(replay.petrified).toBeUndefined();expect(replay.batch06DeplacementInstantane).toBeUndefined();expect(Number(replay.pdv)).toBe(await page.evaluate(()=>CARDS_DATA.EN000002.pdv));
 await evidence(page,testInfo,'clean-free-return');
});

for(const cardId of ['S000015','S000022','S000040','S000041','S000055','S000056'])test(cardId+' UI no eligible target leaves the hand and payment unchanged',async({page})=>{
 await boot(page,{player1:{hand:[cardId]},player2:{graveyard:['R000010','H000036']}},cardId==='S000022'||cardId==='S000056'?theftScenario:graveyardScenario);
 const before=await state(page);await playUI(page,cardId);await settled(page);const after=await state(page);expect(after.player1).toEqual(before.player1);expect(after.plays).toBe(0);
});

test('15E French DOM typography and spell highlights survive narrow wrapping, hand previews and Collection enlarged cards',async({page},testInfo)=>{
 await boot(page,{player1:{hand:ids}});
 const hand=await page.evaluate(ids=>ids.map(id=>{const card=document.querySelector('.hc[data-id="'+id+'"]');openCardPreview(card,{sourceType:'hand',playerId:'player1',sourceElement:card});const preview=document.querySelector('#card-preview-layer');return {id,text:card.textContent,preview:preview?.textContent||'',strong:card.querySelectorAll('strong.kv').length,fac:CARDS_DATA[id].fac,faction:CARDS_DATA[id].canonicalFaction};}),ids);
 for(const value of hand){expect(value.fac).toBe('sort');expect(value.text).not.toMatch(/\[ID\s*=|\\u00a0/i);expect(value.preview).not.toMatch(/\[ID\s*=|\\u00a0/i);expect(value.text).not.toMatch(/ [;:?!]/);if(value.id==='S000026'){expect(value.text).toContain('+1 ATK');expect(value.preview).toContain('+1 ATK');}}
 expect(hand.find(c=>c.id==='S000026').strong).toBeGreaterThan(0);
 const wrapping=await page.evaluate(()=>{const message='Attention ! Coût : 2 Échos. +3 PDV';batch15EMessage(message);const box=document.querySelector('#notif');box.style.width='90px';box.style.whiteSpace='normal';const text=box.firstChild,range=document.createRange();const rect=i=>{range.setStart(text,i);range.setEnd(text,i+1);return range.getBoundingClientRect().top;};return {text:box.textContent,breaks:[...message].flatMap((c,i)=>':;?!'.includes(c)&&rect(i)!==rect(i-2)?[c]:[])};});
 expect(wrapping.text).toBe('Attention ! Coût : 2 Échos. +3 PDV');expect(wrapping.breaks).toEqual([]);await testInfo.attach('typography',{body:Buffer.from(JSON.stringify({hand,wrapping},null,2)),contentType:'application/json'});
 await page.goto('/code/collection.html');await expect(page.locator('#cardsGrid')).toBeVisible();
 for(const id of ids){await page.locator('#searchInput').fill(id);await page.locator('.ccard[data-card-id="'+id+'"]').first().click();await expect(page.locator('#modalOverlay')).toHaveClass(/open/);const value=await page.evaluate(id=>({id,text:document.querySelector('#modalDesc').textContent,desc:CARDS.find(c=>c.id===id).desc,faction:CARDS.find(c=>c.id===id).faction,type:CARDS.find(c=>c.id===id).type}),id);expect(value.type).toBe('Sort');expect(value.text).not.toMatch(/\[ID\s*=|\\u00a0| [;:?!]/i);if(id==='S000026'){expect(value.desc).toContain('strong class="kv"');expect(value.text).toContain('+1 ATK');}await page.keyboard.press('Escape');}
});


test('S000055 UI full board frees real slots and blocks concurrent repeated resolution and end-turn',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000055'],board:Array.from({length:6},(_,i)=>({id:'H000001',instance:'full-'+i})),souls:0}},sacrificeScenario);
 await playUI(page,'S000055');
 const refusals=await page.evaluate(async()=>{const action=window.__batch15eLastAction;const results=await Promise.all([playCard('S000055'),playCard('S000055'),endTurn()]);window.__batch15eLastAction=action;return results.map(r=>r.reason);});
 expect(refusals).toEqual(Array(3).fill('batch15e-resolution-in-progress'));
 await confirmBoard(page,[1,3,5]);const after=await evidence(page,testInfo,'full-board-single-resolution');expect(after.player1.board).toHaveLength(4);expect(after.player1.graveyard.filter(id=>id==='H000001')).toHaveLength(3);expect(after.player1.graveyard.filter(id=>id==='S000055')).toHaveLength(1);expect(after.player1.souls).toBe(10);expect(after.plays).toBe(1);
 expect(after.player1.board.filter(c=>c.id==='H000001').map(c=>c.instance).sort()).toEqual(['full-0','full-2','full-4']);
 expect(await page.evaluate(()=>document.querySelectorAll(playerZoneSelector(player1,'servants')+' .slot').length)).toBe(2);
});

test('S000056 real UI mark cannot rescue into a full hand and produces no free duplicate',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000056'],board:[{id:'H000001',instance:'full-hand-victim'}]}},theftScenario);
 await playUI(page,'S000056');await confirmBoard(page,[0]);
 await page.evaluate(async()=>{for(let i=0;i<12;i++)addCardToHand(player1,'H000005',{refresh:false});refreshHand(player1);await applyDamage(document.querySelector('.fc[data-instance="full-hand-victim"]'),999);});
 const after=await evidence(page,testInfo,'full-hand-refused-rescue');expect(after.player1.hand).toHaveLength(12);expect(after.player1.hand).not.toContain('H000001');expect(after.player1.graveyard).toEqual(['S000056','H000001']);expect(after.player1.board).toEqual([]);
 expect(await page.evaluate(()=>(player1.costModifierState?.active||[]).filter(m=>m.sourceId==='S000056'))).toEqual([]);
});

test('S000055 stale board selection consumes no spell and never substitutes an identical copy',async({page})=>{
 await boot(page,{player1:{hand:['S000055'],board:Array.from({length:4},(_,i)=>({id:'H000001',instance:'stale-'+i})),souls:0}},sacrificeScenario);
 await playUI(page,'S000055');for(const i of [0,1,2])await page.getByTestId('board-target-choice').nth(i).click();
 await page.evaluate(()=>batch03RemoveBoardCardToSlot(document.querySelector('.fc[data-instance="stale-1"]')));
 await page.getByTestId('board-target-confirm').click();await settled(page);const after=await state(page);expect(after.player1.hand).toEqual(['S000055']);expect(after.player1.graveyard).toEqual([]);expect(after.player1.souls).toBe(0);expect(after.plays).toBe(0);expect(after.player1.board.map(c=>c.instance)).toEqual(['stale-0','stale-2','stale-3']);
});


test('S000022 UI duplicate primitive occurrences invalidate a reordered graveyard before confirmation',async({page})=>{
 await boot(page,{player1:{hand:['S000022']},player2:{graveyard:['H000001','H000001']}},theftScenario);
 await playUI(page,'S000022');await page.getByTestId('zone-card-choice').nth(1).click();await page.evaluate(()=>player2.graveyard.reverse());await page.getByTestId('zone-card-confirm').click();await settled(page);
 const after=await state(page);expect(after.player1.hand).toEqual(['S000022']);expect(after.player1.deck).toEqual([]);expect(after.player2.graveyard).toEqual(['H000001','H000001']);expect(after.plays).toBe(0);expect(after.error).toBe('Le cimetière a changé. Recommencez la sélection.');
});

test('S000022 UI theft preserves original owner and occurrence after a full-hand draw refusal',async({page})=>{
 await boot(page,{player1:{hand:['S000022']},player2:{graveyard:['H000001','H000001']}},theftScenario);
 await playUI(page,'S000022');await confirmZones(page,[1]);
 const result=await page.evaluate(()=>{const before={...batch15EZoneIdentity(player1,'deck',0)};for(let i=0;i<12;i++)addCardToHand(player1,'H000005',{refresh:false});const draw=drawCardFromRuntimeDeck(player1);return {before,after:batch15EZoneIdentity(player1,'deck',0),reason:draw.reason,hand:playerHand(player1).length};});
 expect(result.reason).toBe('hand-full');expect(result.hand).toBe(12);expect(result.before.originalOwnerId).toBe('player2');expect(result.after).toEqual(result.before);
});

// Batch 15E2: retain all 35 functional cases above; add true UI geometry and feedback checks.
const e2Messages={gallery:"UN MAGE CRUEL AJOUTE DE NOUVEAUX TROPHÉES À SA MORBIDE COLLECTION.",oath:"LE TISSEUR DE GIVRE HONORE LE PACTE MILLÉNAIRE QUI LE LIE AUX ELFES DE GLACE. L'HIVER SE DÉCHAÎNE SUR LE CHAMP DE BATAILLE !",pixies:'UNE NUÉE DE PIXIES SE JOINT GAIEMENT AU COMBAT !',noPixies:'AUCUN SIGNE DE PIXIES. MAIS QUE FONT CES PETITES CHIPIES ?',survivors:"TOUT N'EST PAS PERDU ! VOS ÉCLAIREURS ONT RAMENÉ ET SOIGNÉ DES RESCAPÉS DE LA CATASTROPHE.",noSurvivors:"VOS ÉCLAIREURS N'ONT PU QUE CONSTATER L'ÉTENDUE DES DÉGÂTS : SUR PLACE, IL N'Y AVAIT PLUS RIEN À SAUVER..."};
const e2Subtitle="Choisissez jusqu'à 5 serviteurs à déterrer du cimetière adverse pour votre armée.";
const e2Dynamic='Bénéficie de Déplacement instantané : la 1ère fois que ce serviteur devrait être détruit, il déclenche sa capacité Vengeance puis est renvoyé dans la main de son propriétaire au lieu du cimetière et peut dès lors être rejoué gratuitement.';
const flat=value=>String(value||'').replace(/\s+/g,' ').trim();
async function e2Choice(page,id){
 await page.setViewportSize({width:1000,height:800});
 const graveyard=Array.from({length:20},(_,i)=>['H000001','H000005','H000006','EN000002'][i%4]);
 await boot(page,{player1:{hand:[id],graveyard,board:Array.from({length:6},(_,i)=>({id:['H000001','H000005','H000006','EN000002','EDG000001','H000036'][i]}))},player2:{graveyard:[...graveyard,'H000036','R000001']}},id==='S000022'||id==='S000056'?theftScenario:id==='S000055'?sacrificeScenario:graveyardScenario);
 await playUI(page,id);await expect(page.locator('.sort-choice-overlay')).toBeVisible();
 return page.getByTestId(id==='S000015'||id==='S000022'?'zone-card-choice':'board-target-choice');
}
for(const id of ['S000015','S000022','S000055','S000056'])test('15E2 '+id+' real modal portrait geometry, gold confirmation and cancellable selection',async({page},testInfo)=>{
 const items=await e2Choice(page,id);await page.screenshot({path:testInfo.outputPath('modal.png')});
 const geometry=await page.evaluate(()=>{const box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}};const cancel=document.querySelector('.sort-choice-cancel-button'),confirm=document.querySelector('.sort-choice-confirm');return {cards:[...document.querySelectorAll('[data-testid="zone-card-choice"] .selection-card,[data-testid="board-target-choice"] .selection-card')].map(box),cancel:box(cancel),confirm:box(confirm),color:getComputedStyle(confirm).color,bg:getComputedStyle(confirm).backgroundImage,disabled:confirm.disabled,images:[...document.querySelectorAll('.selection-card-art>img')].map(e=>getComputedStyle(e).objectFit)};});
 await testInfo.attach('geometry',{body:Buffer.from(JSON.stringify(geometry,null,2)),contentType:'application/json'});
 expect(geometry.cancel.x+geometry.cancel.w).toBeLessThan(geometry.confirm.x);expect(Math.abs(geometry.cancel.y-geometry.confirm.y)).toBeLessThan(1);
 expect(geometry.bg).toContain('255, 228, 163');expect(geometry.bg).toContain('201, 156, 62');expect(geometry.disabled).toBe(true);
 const widths=geometry.cards.map(c=>c.w),heights=geometry.cards.map(c=>c.h);expect(Math.max(...widths)-Math.min(...widths)).toBeLessThan(1);expect(Math.max(...heights)-Math.min(...heights)).toBeLessThan(1);expect(heights[0]/widths[0]).toBeGreaterThan(1.4);expect(geometry.images).not.toContain('fill');
 const min=id==='S000055'?3:1;for(let i=0;i<min;i++)await items.nth(i).click();await expect(page.locator('.sort-choice-confirm')).toBeEnabled();
 if(id==='S000056'){await items.nth(1).click();await expect(items.filter({has:page.locator('.is-selected')})).toHaveCount(0);await expect(page.locator('[data-testid="board-target-choice"].is-selected')).toHaveCount(1);}
 await page.locator('.sort-choice-cancel-button').click();await settled(page);expect((await state(page)).player1.hand).toEqual([id]);expect((await state(page)).plays).toBe(0);
});

test('15E2 Gallery exact subtitle and only eligible rendered servants, no Aria altar',async({page})=>{
 const items=await e2Choice(page,'S000022');expect(flat(await page.locator('.sort-choice-panel').innerText())).toContain(flat(e2Subtitle));
 await expect(page.getByTestId('zone-card-ineligible')).toHaveCount(0);await expect(page.locator('.sort-choice-panel [data-card-id="R000001"]')).toHaveCount(0);await expect(page.locator('.sort-choice-panel [data-card-id="H000036"]')).toHaveCount(0);await expect(items).toHaveCount(20);
 for(let i=0;i<6;i++)await items.nth(i).click();await expect(page.locator('[data-testid="zone-card-choice"].is-selected')).toHaveCount(5);await page.locator('.sort-choice-cancel-button').click();await settled(page);
});
for(const id of ['S000015','S000022','S000055','S000056'])test('15E2 '+id+' hover stays visible at grid edges before and after real scrolling',async({page},testInfo)=>{
 const items=await e2Choice(page,id),grid=page.locator('.sort-choice-cards');
 const metrics=await grid.evaluate(e=>({scroll:e.scrollHeight,client:e.clientHeight,width:getComputedStyle(e).scrollbarWidth,color:getComputedStyle(e).scrollbarColor}));expect(metrics.scroll).toBeGreaterThan(metrics.client);expect(metrics.width).toBe('thin');expect(metrics.color).toContain('200, 168, 75');
 await e3LocalHoverProof(page,items,testInfo);
 await page.locator('.sort-choice-cancel-button').hover();await expect(page.locator('#card-preview-layer.preview-open')).toHaveCount(0);await page.locator('.sort-choice-cancel-button').click();await settled(page);
});

test('15E2 displacement description is occurrence-only, faction-colored and interactive; no 1 marker; real rescue cleans it',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000056'],board:[{id:'H000001',instance:'marked'},{id:'H000001',instance:'untouched'}]}},theftScenario);
 await page.evaluate(()=>applyGel(document.querySelector('.fc[data-instance="marked"]'),2));
 const globalBefore=await page.evaluate(()=>JSON.stringify(CARDS_DATA.H000001)),realName=await page.evaluate(()=>CARDS_DATA.H000001.name.toLocaleUpperCase('fr-FR'));await playUI(page,'S000056');await confirmBoard(page,[0]);
 const marked=page.locator('.fc[data-instance="marked"]'),other=page.locator('.fc[data-instance="untouched"]');
 await expect(marked).toHaveAttribute('data-batch06-deplacement-instantane','1');await expect(marked.locator('[data-batch03-status-counter="deplacement-instantane"]')).toHaveCount(0);await expect(marked.locator('.fc-ice-badge span')).toHaveText('2');
 await marked.hover();await expect(page.locator('#card-preview-layer .fz-desc-inner')).toContainText('Bénéficie de Déplacement instantané');
 const preview=await page.locator('#card-preview-layer').evaluate(e=>({text:e.textContent,kw:e.querySelector('[data-keyword="Vengeance"]')?.textContent,def:[...e.querySelectorAll('.canonical-keyword-tooltip')].find(n=>n.textContent.includes('Vengeance'))?.textContent,color:getComputedStyle(e.querySelector('[data-keyword="Vengeance"]')).color}));
 expect(flat(preview.text)).toContain(flat(e2Dynamic));expect(preview.text).toContain('1ère fois');expect(preview.text).toContain('Déplacement instantané');expect(preview.kw).toBe('Vengeance');expect(preview.def).toContain('Vengeance');expect(preview.color).toBe('rgb(0, 47, 167)');expect(preview.text).not.toContain('[Vengeance]');
 await other.hover();await expect(page.locator('#card-preview-layer')).not.toContainText('Bénéficie de Déplacement instantané');
 await page.evaluate(()=>{const fc=document.querySelector('.fc[data-instance="marked"]');syncBatch06DeplacementCounter(fc);syncBatch06DeplacementCounter(fc);});await marked.hover();await expect(page.locator('#card-preview-layer')).toContainText('Bénéficie de Déplacement instantané');expect((await page.locator('#card-preview-layer').textContent()).match(/Bénéficie de Déplacement\sinstantané/g)).toHaveLength(1);
 expect((await state(page)).message).not.toContain('BAT EN RETRAITE');
 await page.evaluate(()=>{window.__e2RetreatMoments=[];new MutationObserver(()=>{const message=document.querySelector('#notif').textContent;if(message.includes('BAT EN RETRAITE'))window.__e2RetreatMoments.push({message,inHand:playerHand(player1).includes('H000001')});}).observe(document.querySelector('#notif'),{childList:true});});
 await page.evaluate(async()=>{await applyDamage(document.querySelector('.fc[data-instance="marked"]'),999);});await expect(marked).toHaveCount(0);
 const result=await state(page);expect(result.player1.hand).toEqual(['H000001']);expect(result.player1.graveyard).toEqual(['S000056']);expect(result.message).toBe(realName+' BAT EN RETRAITE ET SE TÉLÉPORTE EN ZONE SÛRE.');expect(await page.evaluate(()=>JSON.stringify(CARDS_DATA.H000001))).toBe(globalBefore);
 expect(await page.evaluate(()=>window.__e2RetreatMoments)).toEqual([{message:realName+' BAT EN RETRAITE ET SE TÉLÉPORTE EN ZONE SÛRE.',inHand:true}]);
 await evidence(page,testInfo,'dynamic-cleanup');
});

test('15E2 oath highlights ATK slash and PDV in hand, board preview and Collection enlarged view',async({page})=>{
 await boot(page,{player1:{hand:['S000026']}});await expect(page.locator('.hc[data-id="S000026"] strong.kv').filter({hasText:'ATK/'})).toHaveCount(1);await expect(page.locator('.hc[data-id="S000026"] strong.kv').filter({hasText:'PDV'})).toHaveCount(1);
 await page.locator('.hc[data-id="S000026"]').hover();await expect(page.locator('#card-preview-layer .canonical-card-preview .fz-desc-inner strong.kv').filter({hasText:'ATK/'})).toHaveCount(1);
 await page.goto('/code/collection.html');await page.locator('#searchInput').fill('S000026');await page.locator('.ccard[data-card-id="S000026"]').click();await expect(page.locator('#modalDesc strong.kv').filter({hasText:'ATK/'})).toHaveCount(1);await expect(page.locator('#modalDesc strong.kv').filter({hasText:'PDV'})).toHaveCount(1);
});
for(const [id,message]of [['S000040',e2Messages.noPixies],['S000015',e2Messages.noSurvivors]])test('15E2 '+id+' empty actual result reports exact zero narrative without consumption',async({page})=>{
 await boot(page,{player1:{hand:[id]}});await playUI(page,id);await settled(page);const result=await state(page);expect(result.player1.hand).toEqual([id]);expect(result.plays).toBe(0);expect(result.message).toBe(message);
});
test('15E2 Pixies present but impossible hand return uses zero result feedback',async({page})=>{
 await boot(page,{player1:{hand:['S000040',...Array(11).fill('H000001')],graveyard:['EDB000012','EDB000012']}});await playUI(page,'S000040');await settled(page);const result=await state(page);expect(result.player1.hand).toHaveLength(12);expect(result.player1.graveyard).toEqual(['EDB000012','EDB000012']);expect(result.message).toBe(e2Messages.noPixies);expect(result.plays).toBe(0);
});

async function e2NotificationGeometry(page){
 const actual=await page.locator('#notif').evaluate(e=>{const r=e.getBoundingClientRect(),text=e.firstChild,range=document.createRange(),value=e.textContent;const y=i=>{range.setStart(text,i);range.setEnd(text,i+1);return range.getBoundingClientRect().top;};return {text:value,left:r.left,right:r.right,top:r.top,bottom:r.bottom,w:innerWidth,h:innerHeight,overflow:e.scrollWidth>e.clientWidth||e.scrollHeight>e.clientHeight,orphans:[...value].flatMap((c,i)=>':;?!'.includes(c)&&i>1&&y(i)!==y(i-2)?[i]:[])};});
 expect(actual.text).not.toMatch(/ [;:?!]|\\u00a0/i);expect(actual.left).toBeGreaterThanOrEqual(0);expect(actual.right).toBeLessThanOrEqual(actual.w);expect(actual.top).toBeGreaterThanOrEqual(0);expect(actual.bottom).toBeLessThanOrEqual(actual.h);expect(actual.overflow).toBe(false);expect(actual.orphans).toEqual([]);
}

test.afterEach(async({page},testInfo)=>{if(testInfo.status===testInfo.expectedStatus)return;try{const snapshot=await page.evaluate(()=>({actions:window.__batch15eUIActions,events:collectionBatch15EState.events,flights:[...document.querySelectorAll('.batch09-cadaver-flight')].map(e=>({...e.dataset,animations:e.getAnimations().map(a=>({state:a.playState,time:a.currentTime}))}))}));await testInfo.attach('15e-failure-runtime',{body:Buffer.from(JSON.stringify(snapshot,null,2)),contentType:'application/json'});}catch{}});

// Batch 15E3 strengthens the existing hover cases and adds target-theme/art/icon/label/punctuation proofs.
// A >1.03 width ratio can occur at ~133ms of the 200ms scale(1.04)
// transition. Compare settled geometry, without changing the 0.5px tolerance.
async function waitForSelectionTransforms(page){
 const frames=await page.locator('.batch15e2-selection').evaluate(async panel=>{
  let timer,expired=false;
  const frame=()=>new Promise(requestAnimationFrame);
  const observe=async()=>{
   for(;;){
    await frame();
    if(expired)throw new Error('Selection transform transition timed out');
    const transitions=[...panel.querySelectorAll('.sort-choice-item')].flatMap(item=>{
     getComputedStyle(item).transform;
     return item.getAnimations().filter(animation=>animation instanceof CSSTransition && animation.effect?.target===item && animation.transitionProperty==='transform' && animation.playState!=='finished');
    });
    if(!transitions.length)break;
    await Promise.all(transitions.map(animation=>animation.finished));
   }
   const samples=[];
   for(let i=0;i<3;i++){
    await frame();
    samples.push([...panel.querySelectorAll('.selection-card')].flatMap(card=>{const r=card.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}));
   }
   return samples;
  };
  try{return await Promise.race([observe(),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('Selection transform did not finish within 2000ms'));},2000);})]);}
  finally{clearTimeout(timer);}
 });
 for(const sample of frames.slice(1)){
  expect(sample).toHaveLength(frames[0].length);
  sample.forEach((value,index)=>expect(value).toBeCloseTo(frames[0][index],0));
 }
}
async function e3LocalHoverProof(page,items,testInfo){
 const grid=page.locator('.sort-choice-cards'),count=await items.count();
 const edges=await items.evaluateAll(nodes=>{const rows=new Map();nodes.forEach((e,i)=>{const y=Math.round(e.getBoundingClientRect().top);if(!rows.has(y))rows.set(y,[]);rows.get(y).push(i)});const list=[...rows.values()];return [...new Set([list[0][0],list[0].at(-1),list.at(-1)[0],list.at(-1).at(-1)])]});
 for(const index of edges){
  await page.locator('.sort-choice-title').hover();await waitForSelectionTransforms(page);await items.nth(index).scrollIntoViewIfNeeded();await waitForSelectionTransforms(page);
  // The grid and untransformed layout offsets must stay fixed while its card grows.
  const layout=()=>grid.evaluate(e=>{const r=e.getBoundingClientRect();return [r.x,r.y,r.width,r.height,e.scrollTop,e.scrollLeft,...[...e.querySelectorAll('.sort-choice-item')].flatMap(item=>[item.offsetLeft,item.offsetTop,item.offsetWidth,item.offsetHeight])]});
  const layoutBefore=await layout(),base=await items.nth(index).locator('.selection-card').boundingBox();await items.nth(index).hover();await waitForSelectionTransforms(page);
  await page.screenshot({path:testInfo.outputPath('hover-edge-'+index+'.png')});
  await expect.poll(async()=>{const r=await items.nth(index).locator('.selection-card').boundingBox();return r.width/base.width}).toBeGreaterThan(1.03);
  const r=await items.nth(index).locator('.selection-card').boundingBox(),g=await grid.boundingBox();expect(r.width/base.width).toBeLessThan(1.05);expect(Math.abs((r.x+r.width/2)-(base.x+base.width/2))).toBeLessThan(10);expect(Math.abs(r.y-base.y)).toBeLessThan(15);
  await expect(page.locator('#card-preview-layer.preview-open')).toHaveCount(0);
  expect(r.x).toBeGreaterThanOrEqual(g.x);expect(r.y).toBeGreaterThanOrEqual(g.y);expect(r.x+r.width).toBeLessThanOrEqual(g.x+g.width);expect(r.y+r.height).toBeLessThanOrEqual(g.y+g.height);
  const corners=await items.nth(index).evaluate(item=>{const r=item.querySelector('.selection-card').getBoundingClientRect();return [[r.left+4,r.top+4],[r.right-4,r.top+4],[r.left+4,r.bottom-4],[r.right-4,r.bottom-4]].map(([x,y])=>item.contains(document.elementFromPoint(x,y)))});expect(corners).toEqual([true,true,true,true]);
  await items.nth(index).hover();await waitForSelectionTransforms(page);expect((await items.nth(index).locator('.selection-card').boundingBox()).y).toBeCloseTo(r.y,0);
  const layoutAfter=await layout();expect(layoutAfter).toHaveLength(layoutBefore.length);layoutAfter.forEach((value,i)=>expect(value).toBeCloseTo(layoutBefore[i],0));
 }
 await page.screenshot({path:testInfo.outputPath('hover-last-row.png')});
}
for(const id of ['S000015','S000022','S000055','S000056'])test('15E3 '+id+' artwork truly fills its frame and every offered faction icon is loaded and visible',async({page},testInfo)=>{
 const items=await e2Choice(page,id);await page.locator('.selection-card-art img').evaluateAll(nodes=>Promise.all(nodes.map(e=>e.decode().catch(()=>{}))));await page.screenshot({path:testInfo.outputPath('art-and-factions.png')});
 const cards=await items.evaluateAll(nodes=>nodes.map(item=>{const card=item.querySelector('.selection-card'),art=card.querySelector('.selection-card-art'),image=art.querySelector(':scope>img:not(.selection-card-faction)'),icon=art.querySelector('.selection-card-faction'),b=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}},a=b(art),i=b(image),fit=getComputedStyle(image).objectFit,scale=fit==='cover'?Math.max(i.w/image.naturalWidth,i.h/image.naturalHeight):Math.min(i.w/image.naturalWidth,i.h/image.naturalHeight),cardId=item.dataset.cardId||item.dataset.targetId;return {id:cardId,fac:CARDS_DATA[cardId].fac,art:a,image:i,natural:[image.naturalWidth,image.naturalHeight],paintedWidth:image.naturalWidth*scale,fit,icon:icon?{src:icon.getAttribute('src'),loaded:icon.complete&&icon.naturalWidth>0,box:b(icon)}:null,expected:factionIconFile(CARDS_DATA[cardId])}}));
 await testInfo.attach('loaded-card-geometry',{body:Buffer.from(JSON.stringify(cards,null,2)),contentType:'application/json'});expect(new Set(cards.map(c=>c.fac)).size).toBeGreaterThan(1);
 for(const c of cards){expect(c.natural[0]).toBeGreaterThan(0);expect(c.image.w).toBeCloseTo(c.art.w,0);expect(c.paintedWidth).toBeGreaterThanOrEqual(c.art.w-.5);expect(c.fit).not.toBe('fill');expect(c.icon).not.toBeNull();expect(c.icon.loaded).toBe(true);expect(c.icon.src).toContain('/icones/'+c.expected);expect(c.icon.box.x).toBeGreaterThanOrEqual(c.art.x);expect(c.icon.box.x+c.icon.box.w).toBeLessThan(c.art.x+c.art.w/2);expect(c.icon.box.y).toBeGreaterThanOrEqual(c.art.y);expect(c.icon.box.bottom).toBeLessThan(c.art.y+c.art.h/2)}
 await page.locator('.sort-choice-cancel-button').click();await settled(page);
});
for(const [id,owner]of [['S000015','player1'],['S000022','player2']])test('15E3 '+id+' removes redundant visible cemetery line while preserving source ownership',async({page})=>{
 const items=await e2Choice(page,id);await expect(page.getByTestId('batch15e-source-zone')).toHaveCount(0);await expect(page.locator('.sort-choice-title')).toHaveText(await page.evaluate(id=>CARDS_DATA[id].name,id));if(id==='S000022')expect(flat(await page.locator('.sort-choice-panel').innerText())).toContain(flat(e2Subtitle));else await expect(page.locator('.sort-choice-panel')).toContainText('Choisissez');expect(await items.evaluateAll(nodes=>[...new Set(nodes.map(e=>e.dataset.sourceOwner))])).toEqual([owner]);await confirmZones(page,[0]);const after=await state(page);expect(after.player1.deck).toHaveLength(1);expect(after.message).toBe(id==='S000022'?e2Messages.gallery:e2Messages.survivors);
});
test('15E3 Triangle prompt keeps its exact wording with final period',async({page})=>{await e2Choice(page,'S000055');await expect(page.getByTestId('board-target-prompt')).toHaveText('Offrez trois vies en sacrifice au Triangle des ténèbres.');await page.locator('.sort-choice-cancel-button').click();await settled(page)});
for(const target of ['H000009','N000004','GOB000001'])test('15E3 attached spell title inherits actual target renderer theme '+target,async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000056','S000056'],board:[{id:target,instance:'theme-marked'},{id:target,instance:'theme-other'}]}},theftScenario);await page.evaluate(()=>applyGel(document.querySelector('.fc[data-instance="theme-marked"]'),2));const marked=page.locator('.fc[data-instance="theme-marked"]'),other=page.locator('.fc[data-instance="theme-other"]');await marked.hover();await expect(page.locator('#card-preview-layer .kv').filter({hasText:'2'})).toHaveCount(1);const expected=await page.locator('#card-preview-layer .kv').filter({hasText:'2'}).evaluate(e=>getComputedStyle(e).color),canonical=await page.evaluate(id=>JSON.stringify(CARDS_DATA[id]),target);
 await playUI(page,'S000056');await confirmBoard(page,[0]);await marked.hover();const title=page.locator('#card-preview-layer .fz-desc-inner strong.kv').filter({hasText:/^Déplacement\sinstantané$/});await expect(title).toHaveCount(1);expect(await title.evaluate(e=>getComputedStyle(e).color)).toBe(expected);expect(flat(await page.locator('#card-preview-layer .fz-desc-inner').innerText())).toContain(flat(e2Dynamic));await expect(page.locator('#card-preview-layer .canonical-card-preview [data-keyword="Vengeance"]')).toHaveCount(1);await expect(page.locator('#card-preview-layer .canonical-keyword-tooltip').filter({hasText:'Vengeance'})).toHaveCount(1);
 await other.hover();await expect(page.locator('#card-preview-layer')).not.toContainText('Bénéficie de Déplacement instantané');
 await playUI(page,'S000056');const offered=page.getByTestId('board-target-choice').first().locator('.selection-card-text strong.kv').filter({hasText:/^Déplacement\sinstantané$/});await expect(offered).toHaveCount(1);expect(await offered.evaluate(e=>getComputedStyle(e).color)).toBe(expected);await page.locator('.sort-choice-cancel-button').click();await settled(page);
 await page.evaluate(()=>applyDamage(document.querySelector('.fc[data-instance="theme-marked"]'),999));await expect(marked).toHaveCount(0);await page.locator('.hc[data-id="'+target+'"]').hover();await expect(page.locator('#card-preview-layer')).not.toContainText('Bénéficie de Déplacement instantané');expect(await page.evaluate(id=>JSON.stringify(CARDS_DATA[id]),target)).toBe(canonical);await testInfo.attach('canonical-target-theme',{body:Buffer.from(JSON.stringify({target,expected})),contentType:'application/json'});
});

const e4Mixed=(owner='player1',prefix='own')=>[entry('R000010',prefix+'-altar',owner),entry('H000001',prefix+'-dup-a',owner),entry('R000001',prefix+'-mine',owner),entry('H000001',prefix+'-dup-b',owner),entry('EDG000012',prefix+'-tisseur',owner),entry('H000005',prefix+'-soldier',owner),entry('S000022',prefix+'-spell',owner),entry('H000036',prefix+'-gabar',owner)];
async function e4Source(page,player='player1',zone='graveyard'){return page.evaluate(({player,zone})=>{const p=playerState(player);batch15ETrackZone(p,zone);return zoneArrayForPlayer(p,zone).map((e,index)=>({cardId:getRuntimeCardId(e),...batch15EZoneIdentity(p,zone,index)}))},{player,zone})}
async function e4AssertNoIneligible(page,{gallery=false}={}){
 await expect(page.getByTestId('zone-card-ineligible')).toHaveCount(0);
 for(const id of ['R000010','R000001','EDG000012','S000022',...(gallery?['H000036']:[])])await expect(page.locator('.sort-choice-panel .sort-choice-item[data-card-id="'+id+'"]')).toHaveCount(0);
}
test('15E4 After mixed cemetery keeps the real Aria altar but renders only eligible exact occurrences and returns three',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000015'],graveyard:e4Mixed()},player2:{graveyard:[entry('H000005','opponent-safe','player2')]}});const before=await state(page),source=await e4Source(page);expect(source[0]).toMatchObject({cardId:'R000010',occurrenceId:'own-altar'});await playUI(page,'S000015');
 const altar=page.locator('.sort-choice-panel .sort-choice-item[data-card-id="R000010"]');if(await altar.count())await altar.scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('mixed-cemetery-selector.png')});await testInfo.attach('source-cemetery-retained',{body:Buffer.from(JSON.stringify(await e4Source(page),null,2)),contentType:'application/json'});
 await expect(altar).toHaveCount(0);await e4AssertNoIneligible(page);const items=page.getByTestId('zone-card-choice');await expect(items).toHaveCount(4);expect(await items.evaluateAll(nodes=>nodes.map(e=>({id:e.dataset.cardId,index:Number(e.dataset.zoneIndex),occurrence:e.dataset.occurrenceId,owner:e.dataset.sourceOwner})))).toEqual([{id:'H000001',index:1,occurrence:'own-dup-a',owner:'player1'},{id:'H000001',index:3,occurrence:'own-dup-b',owner:'player1'},{id:'H000005',index:5,occurrence:'own-soldier',owner:'player1'},{id:'H000036',index:7,occurrence:'own-gabar',owner:'player1'}]);expect(await e4Source(page)).toEqual(source);await expect(page.getByTestId('zone-card-confirm')).toBeDisabled();
 await items.nth(0).click();await items.nth(1).click();await expect(page.locator('[data-testid="zone-card-choice"].is-selected')).toHaveCount(2);await items.nth(0).click();await items.nth(2).click();await items.nth(3).click();await items.nth(0).click();await expect(page.locator('[data-testid="zone-card-choice"].is-selected')).toHaveCount(3);await page.getByTestId('zone-card-confirm').click();await settled(page);
 const after=await state(page);expect([...after.player1.deck].sort()).toEqual(['H000001','H000005','H000036']);expect(after.player1.graveyard).toEqual(['R000010','H000001','R000001','EDG000012','S000022','S000015']);expect(after.player2).toEqual(before.player2);expect(after.player1.hand).toEqual([]);expect(after.plays).toBe(1);expect(after.message).toBe(e2Messages.survivors);expect((await e4Source(page,'player1','deck')).map(e=>e.occurrenceId).sort()).toEqual(['own-dup-b','own-gabar','own-soldier']);expect((await e4Source(page)).find(e=>e.cardId==='H000001')).toMatchObject({occurrenceId:'own-dup-a'});expect(await page.evaluate(()=>({cardId:lastZoneEffectDiagnostic.cardId,shuffled:lastZoneEffectDiagnostic.shuffled,moved:lastZoneEffectDiagnostic.moved.length}))).toEqual({cardId:'S000015',shuffled:true,moved:3});const fx=await transfers(page);expect(fx.observed).toHaveLength(3);expect(fx.observed.every(e=>e.sourceOwner==='player1'&&e.destinationOwner==='player1'&&e.sourceZone==='graveyard'&&e.destinationZone==='deck')).toBe(true);expect(fx.ghosts).toBe(0);await evidence(page,testInfo,'mixed-exact-three');
});
test('15E4 After cancelling a filtered mixed cemetery preserves every occurrence and payment',async({page})=>{
 await boot(page,{player1:{hand:['S000015'],graveyard:e4Mixed()}});const before=await state(page),source=await e4Source(page),resources=await page.evaluate(()=>currentResourceSnapshot());await playUI(page,'S000015');await e4AssertNoIneligible(page);await page.getByTestId('zone-card-choice').nth(1).click();await page.locator('.sort-choice-cancel-button').click();await settled(page);const after=await state(page);expect(after.player1).toEqual(before.player1);expect(after.player2).toEqual(before.player2);expect(after.plays).toBe(0);expect(after.message).not.toBe(e2Messages.survivors);expect(await e4Source(page)).toEqual(source);expect(await page.evaluate(()=>currentResourceSnapshot())).toEqual(resources);expect((await transfers(page)).observed).toEqual([]);
});
test('15E4 After only canonical ineligible entries uses zero feedback with no selector or consumption',async({page},testInfo)=>{
 const graveyard=['R000010','R000001','S000022','EDG000012'];await boot(page,{player1:{hand:['S000015'],graveyard}});const before=await state(page),resources=await page.evaluate(()=>currentResourceSnapshot());await playUI(page,'S000015');await settled(page);await expect(page.locator('.sort-choice-overlay')).toHaveCount(0);await expect(page.getByTestId('zone-card-choice')).toHaveCount(0);await expect(page.getByTestId('zone-card-ineligible')).toHaveCount(0);const after=await state(page);expect(after.player1).toEqual(before.player1);expect(after.message).toBe(e2Messages.noSurvivors);expect(after.plays).toBe(0);expect(await page.evaluate(()=>currentResourceSnapshot())).toEqual(resources);expect((await transfers(page)).observed).toEqual([]);await evidence(page,testInfo,'ineligible-only-no-consumption');
});
test('15E4 After revalidates a selected occurrence becoming canonically ineligible before confirmation',async({page})=>{
 await boot(page,{player1:{hand:['S000015'],graveyard:e4Mixed()}});const resources=await page.evaluate(()=>currentResourceSnapshot());await playUI(page,'S000015');await page.getByTestId('zone-card-choice').nth(1).click();await page.evaluate(()=>{player1.graveyard[3]={cardId:'EDG000012',occurrenceId:'replacement-tisseur',originalOwnerId:'player1'}});await page.getByTestId('zone-card-confirm').click();await settled(page);const after=await state(page);expect(after.player1.hand).toEqual(['S000015']);expect(after.player1.deck).toEqual([]);expect(after.plays).toBe(0);expect(after.actions.at(-1).reason).toBe('graveyard-selection-stale');expect(after.player1.graveyard[0]).toBe('R000010');expect(after.player1.graveyard[3]).toBe('EDG000012');expect(await page.evaluate(()=>currentResourceSnapshot())).toEqual(resources);expect((await transfers(page)).observed).toEqual([]);
});
test('15E4 Gallery still filters its opponent cemetery and confirms multiple distinct duplicate occurrences',async({page},testInfo)=>{
 await boot(page,{player1:{hand:['S000022'],graveyard:e4Mixed()},player2:{graveyard:e4Mixed('player2','enemy')}},theftScenario);const before=await state(page);await playUI(page,'S000022');await e4AssertNoIneligible(page,{gallery:true});const items=page.getByTestId('zone-card-choice');await expect(items).toHaveCount(3);expect(await items.evaluateAll(nodes=>nodes.map(e=>e.dataset.sourceOwner))).toEqual(['player2','player2','player2']);expect(await items.evaluateAll(nodes=>nodes.map(e=>e.dataset.occurrenceId))).toEqual(['enemy-dup-a','enemy-dup-b','enemy-soldier']);await confirmZones(page,[0,1,2]);const after=await state(page);expect([...after.player1.deck].sort()).toEqual(['H000001','H000001','H000005']);expect(after.player2.graveyard).toEqual(['R000010','R000001','EDG000012','S000022','H000036']);expect(after.player1.graveyard).toEqual([...before.player1.graveyard,'S000022']);expect(after.message).toBe(e2Messages.gallery);const deck=await e4Source(page,'player1','deck');expect(deck.map(e=>e.occurrenceId).sort()).toEqual(['enemy-dup-a','enemy-dup-b','enemy-soldier']);expect(deck.every(e=>e.originalOwnerId==='player2')).toBe(true);expect((await transfers(page)).observed).toHaveLength(3);await evidence(page,testInfo,'gallery-owner-and-copies');
});
