/* Presentation only. Owner authentication and workspace entry remain in app.js. */
(()=>{
 const welcome=document.getElementById('welcome'),button=document.getElementById('welcome-motion');
 if(!welcome||!button)return;
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 let playing=!reduced.matches;
 function render(){
  welcome.dataset.motion=playing?'on':'off';
  button.setAttribute('aria-pressed',String(playing));
  button.querySelector('span:last-child').textContent=playing?'หยุดการเคลื่อนไหว':'เปิดการเคลื่อนไหว';
  welcome.querySelectorAll('.df-connections').forEach(svg=>{if(playing)svg.unpauseAnimations?.();else svg.pauseAnimations?.();});
 }
 button.addEventListener('click',()=>{playing=!playing;render();});
 reduced.addEventListener?.('change',event=>{playing=!event.matches;render();});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden)welcome.querySelectorAll('.df-connections').forEach(svg=>svg.pauseAnimations?.());
  else render();
 });
 render();
})();
