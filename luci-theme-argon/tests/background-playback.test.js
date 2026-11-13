'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const template = fs.readFileSync(path.join(__dirname, '../ucode/template/themes/argon/login_background.ut'), 'utf8');
const script = template.match(/<script>([\s\S]*?)<\/script>/)[1];
function fixture(reduced = false, blocked = false) {
 const video = Object.assign(new EventTarget(), { paused: true, muted: true,
  play() { if (blocked) return Promise.reject(Error('blocked'));this.paused = false;this.dispatchEvent(new Event('play'));return Promise.resolve(); },
  pause() { this.paused = true;this.dispatchEvent(new Event('pause')); }
 });
 const classes = new Set();
 const button = Object.assign(new EventTarget(), { dataset: { playLabel: 'Play', pauseLabel: 'Pause' },attrs: {},
  classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },setAttribute(name,value) { this.attrs[name] = value; }
 });
 const muteClasses = new Set(['mute']);
 const mute = Object.assign(new EventTarget(), { attrs: {},classList: { contains: n=>muteClasses.has(n),add: n=>muteClasses.add(n),remove: n=>muteClasses.delete(n) },setAttribute(n,v){this.attrs[n]=v;} });
 const preference = Object.assign(new EventTarget(), { matches: reduced });
 const document = Object.assign(new EventTarget(), { hidden: false,getElementById: ()=>video,querySelector: selector=>selector==='.playback-control'?button:mute });
 new Function('document','window',script)(document,{matchMedia:()=>preference});
 return {video,button,mute,preference,document,classes,unblock(){blocked=false;}};
}

test('manual pause survives visibility and system motion changes', () => {
 const s=fixture();assert.equal(s.video.paused,false);assert.equal(s.button.attrs['aria-label'],'Pause');
 s.button.dispatchEvent(new Event('click'));assert.equal(s.video.paused,true);assert.equal(s.button.attrs['aria-label'],'Play');
 s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));s.document.hidden=false;s.document.dispatchEvent(new Event('visibilitychange'));
 s.preference.matches=true;s.preference.dispatchEvent(new Event('change'));s.preference.matches=false;s.preference.dispatchEvent(new Event('change'));
 assert.equal(s.video.paused,true);
});

test('reduced motion starts static but permits explicit playback and pauses on a new preference', () => {
 const s=fixture(true);assert.equal(s.video.paused,true);s.button.dispatchEvent(new Event('click'));assert.equal(s.video.paused,false);
 s.document.hidden=true;s.document.dispatchEvent(new Event('visibilitychange'));assert.equal(s.video.paused,true);
 s.document.hidden=false;s.document.dispatchEvent(new Event('visibilitychange'));assert.equal(s.video.paused,false);
 s.preference.matches=false;s.preference.dispatchEvent(new Event('change'));s.preference.matches=true;s.preference.dispatchEvent(new Event('change'));assert.equal(s.video.paused,true);
});

test('blocked autoplay stays playable and muting does not change playback preference', async () => {
 const s=fixture(false,true);await Promise.resolve();assert.equal(s.button.attrs['aria-label'],'Play');assert.equal(s.classes.has('playing'),false);
 s.unblock();s.button.dispatchEvent(new Event('click'));assert.equal(s.video.paused,false);
 s.mute.dispatchEvent(new Event('click'));assert.equal(s.video.muted,false);assert.equal(s.mute.attrs['aria-pressed'],'false');assert.equal(s.video.paused,false);
 s.mute.dispatchEvent(new Event('click'));assert.equal(s.video.muted,true);
});
