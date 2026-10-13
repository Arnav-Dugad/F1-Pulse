const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../js/preferences.js'),'utf8');
test('preferences retain in-memory updates when old storage is readable but writes fail',()=>{
    const context=vm.createContext({Map,localStorage:{getItem:()=>JSON.stringify(['old']),setItem:()=>{throw Error('quota')}},module:{exports:{}}});
    vm.runInContext(source,context);const store=context.module.exports;
    store.toggleFavourite('driver','new');assert.equal(store.isFavourite('driver','new'),true);
    store.toggleFavourite('driver','old');assert.equal(store.isFavourite('driver','old'),false);
});
test('preferences reject malformed favourite arrays and use memory when all storage is blocked',()=>{
    const context=vm.createContext({Map,localStorage:{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}},module:{exports:{}}});
    vm.runInContext(source,context);const store=context.module.exports;
    store.write('favourites:driver',null);assert.equal(store.favourites('driver').length,0);
    store.toggleFavourite('driver','one');assert.equal(store.isFavourite('driver','one'),true);
});
