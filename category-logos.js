/* Small category marks; labels and category IDs stay unchanged. */
(()=>{
 const marks={'13Enterprise':['enterprise',''],'13Education':['education',''],'DR.EV':['drev',''],'EV Life Thailand':['evlife',''],'SIYI':['siyi',''],'ALTURA':['altura',''],'Delivery Drone':[null,'✈'],'งานทั่วไป / ประสานงาน':[null,'▤'],'Event':[null,'🎟️']};
 document.querySelectorAll('#projects button').forEach((button,index)=>{
  const name=projects[index]?.[0],mark=marks[name];if(!mark)return;
  const icon=document.createElement('span');icon.className='category-logo';icon.setAttribute('aria-hidden','true');
  if(mark[0]){const img=document.createElement('img');img.src='assets/brands/'+mark[0]+'.png';img.alt='';img.width=26;img.height=26;icon.append(img);}else{icon.textContent=mark[1];icon.classList.add('category-symbol');}
  button.querySelector('.dot')?.remove();button.prepend(icon);
 });
})();
