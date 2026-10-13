const { test } = require('node:test');
const assert = require('node:assert/strict');
const Lab = require('../js/lab-core.js');
const Driver = id => ({ driverId: id, givenName: 'Test', familyName: id, code: id.toUpperCase() });
const result = (id, position, points, team = 'one') => ({ Driver: Driver(id), Constructor: { constructorId: team, name: team }, position: String(position), points: String(points), grid: '8', laps: '50', status: 'Finished' });
const race = (round, entries, extras = {}) => ({ season: '2026', round: String(round), raceName: `Race ${round}`, date: '2026-01-01', Results: entries, ...extras });

test('modern full-distance awards and 2021 sprint awards remain separate', () => {
    assert.deepEqual(Array.from({length: 11}, (_, i) => Lab.score(i + 1)), [25,18,15,12,10,8,6,4,2,1,0]);
    assert.equal(Lab.score(1, 'sprint'), 8); assert.equal(Lab.score(1, 'sprint', 2021), 3);
    assert.equal(Lab.score(4, 'sprint', 2021), 0);
});
test('countback compares race wins then lower placings and preserves unresolved ties', () => {
    const rows = Lab.rank([{id:'a', points:50, counts:[0,1,2]}, {id:'b',points:50,counts:[0,2]}, {id:'c',points:50,counts:[0,1,2]}]);
    assert.equal(rows[0].id, 'b'); assert.equal(rows[1].position, 2); assert.equal(rows[2].position, 2); assert.equal(rows[2].tied, true);
});
test('recorded ledger keeps fractional awards and credits the actual constructor at each event', () => {
    const book = Lab.ledger([race(1,[result('a',1,12.5)]),race(2,[result('a',2,18,'two')])], [race(2,[],{SprintResults:[result('a',1,8,'two')]})]);
    assert.equal(book.drivers.get('a').points,38.5); assert.equal(book.drivers.get('a').race,30.5);
    assert.equal(book.teams.get('one').drivers.a,12.5); assert.equal(book.teams.get('two').drivers.a,26);
    assert.deepEqual(book.events.map(e=>e.kind),['race','sprint','race']);
});
test('history snapshots never acquire wins or points from later events', () => {
    const snapshots = Lab.history([race(1,[result('a',1,25)]),race(2,[result('a',1,25)])]);
    assert.equal(snapshots[0].standings[0].points,25); assert.equal(snapshots[0].standings[0].counts[1],1);
    assert.equal(snapshots[1].standings[0].counts[1],2); assert.equal(snapshots[1].before[0].counts[1],1);
});
test('unpublished past results keep a conservative points ceiling until results arrive', () => {
    const calendar = [race(1,[],{Sprint:{date:'2026-01-01'}}),race(2,[],{date:'2026-12-01'})];
    const events = Lab.remainingEvents(calendar,[],[],Date.parse('2026-10-01'));
    assert.equal(events.length,3); assert.match(events[0].label,/pending/);
    assert.equal(Lab.remainingEvents(calendar,[race(1,[])],[race(1,[])],Date.parse('2026-10-01')).length,1);
    const bounds = Lab.titleBounds([{id:'a',points:100},{id:'b',points:90}],events);
    assert.equal(bounds[0].clinched,false); assert.equal(bounds[0].remaining,58);
});
test('title ceiling does not declare a points tie clinched or eliminated', () => {
    const rows=Lab.titleBounds([{id:'a',points:100},{id:'b',points:75}], [{maximum:25}]);
    assert.equal(rows[0].clinched,false); assert.equal(rows[1].eliminated,false); assert.equal(rows[1].tiePossible,true);
    assert.equal(rows[0].guarantee,1);
});
test('scenario totals start at published points and reject duplicate finishes', () => {
    const official=[{Driver:Driver('a'),points:'90'},{Driver:Driver('b'),points:'100'}], events=[{round:3,kind:'race',season:2026,label:'R3'}];
    const book=Lab.ledger([race(1,[result('a',1,25),result('b',2,18)])]);
    const projection=Lab.applyScenario(official,book,events,{'3:race':{a:1,b:2}});
    assert.equal(projection.rows.find(r=>r.id==='a').points,115); assert.equal(book.drivers.get('a').points,25);
    assert.match(Lab.applyScenario(official,book,events,{'3:race':{a:1,b:1}}).errors[0],/assigned twice/);
    assert.equal(Lab.applyScenario(official,book,events,{}).rows[0].points,100);
});
function replay() {
    const start='2026-01-01T12:00:00Z', t=Date.parse(start);
    return Lab.prepareReplay({drivers:[{driver_number:1,name_acronym:'A'}],laps:[{driver_number:1,date_start:start,lap_number:1,lap_duration:90},{driver_number:1,date_start:new Date(t+90000).toISOString(),lap_number:2,lap_duration:80}],positions:[{driver_number:1,date:start,position:2},{driver_number:1,date:new Date(t+100000).toISOString(),position:1}], intervals:[{driver_number:1,date:start,interval:'+1 LAP',gap_to_leader:'+1 LAP'}],stints:[{driver_number:1,lap_start:1,lap_end:2,compound:'SOFT',tyre_age_at_start:2}]});
}
test('replay binary lookup and recent pace never use a future observation', () => {
    const data=replay(), early=Lab.replayState(data,data.start+45000)[0];
    assert.equal(early.position,2); assert.equal(early.lastLap,null); assert.equal(early.pace,null); assert.equal(early.progress,.5);
    const later=Lab.replayState(data,data.start+100000)[0];
    assert.equal(later.position,1); assert.equal(later.lastLap,90); assert.equal(later.pace,90); assert.equal(later.tyreAge,3);
    assert.equal(Lab.at([{t:20},{t:30}],10),null);
});
test('battle detector requires adjacent positions and a numeric recorded interval', () => {
    const ahead={id:'a',position:1,pace:90,compound:'SOFT'}, behind={id:'b',position:2,interval:1.2,pace:89,compound:'MEDIUM'};
    assert.equal(Lab.battles([ahead,behind])[0].paceDelta,-1);
    assert.equal(Lab.battles([ahead,{...behind,interval:'+1 LAP'}]).length,0);
    assert.equal(Lab.battles([ahead,{...behind,position:3}]).length,0);
});
test('retirement estimate and provider exchanges are explicitly labelled', () => {
    const data=replay(); data.results=[{Driver:Driver('a'),status:'Engine',laps:'2'}];
    const events=Lab.replayEvents(data,{overtakes:[{date:new Date(data.start+50000).toISOString(),overtaking_driver_number:1,overtaken_driver_number:2}]});
    assert.match(events.find(e=>e.kind==='retirement').detail,/not an exact retirement time/);
    assert.match(events.find(e=>e.kind==='exchange').detail,/pit stops/);
});
test('track route handles unavailable coordinates and interpolates within its recorded shape', () => {
    assert.equal(Lab.trackGeometry([]),null); assert.equal(Lab.routePoint(null,.5),null);
    assert.deepEqual(Lab.routePoint([[0,0],[10,20]],.25),[2.5,5]);
    assert.equal(Lab.trackGeometry(Array.from({length:8},(_,i)=>({x:i,y:i%2}))).length,8);
});
test('forecast evaluation is walk-forward and compares a previous-winner baseline', () => {
    const races=Array.from({length:5},(_,i)=>race(i+1,[result(i===3?'b':'a',1,25),result(i===3?'a':'b',2,18)]));
    const evaluation=Lab.backtest(races);
    assert.equal(evaluation.races,2); assert.equal(evaluation.evaluations[0].predicted.driverId,'a'); assert.equal(evaluation.evaluations[0].correct,false);
    assert.equal(evaluation.winnerAccuracy,.5); assert.equal(evaluation.samples,4);
    assert.equal(Lab.backtest(races.slice(0,3)).winnerAccuracy,null);
});
test('weekly digest excludes future dates and recovery facts avoid overtaking claims', () => {
    const cards=Lab.insights({races:[race(1,[result('a',1,25)],{date:'2026-10-02'}),race(2,[result('a',1,25)],{date:'2026-10-09'})],now:Date.parse('2026-10-03')});
    const digest=cards.find(c=>c.id==='week'); assert.equal(digest.evidence.length,1);
    assert.match(cards.find(c=>c.id==='recovery').method,/does not count on-track/);
    assert.equal(Lab.esc('<img onerror="x">'),'&lt;img onerror=&quot;x&quot;&gt;');
});
