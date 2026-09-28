(() => {
  const c = window.TCW_RELEASES || {};
  const $ = id => document.getElementById(id);
  const hr = (c.hrUrl || '#').replace(/\/$/,'');
  const signup = c.signupUrl || (hr && hr !== '#' ? hr + '/signup' : '#');
  const admin = c.adminUrl || '#';

  ['loginTop','loginTrial','loginFinal','loginFooter','mobileLogin','pwaButton'].forEach(id=>{const el=$(id);if(el)el.href=hr||'#';});
  ['signupTop','signupHero','signupTrial','signupFinal','mobileSignup'].forEach(id=>{const el=$(id);if(el)el.href=signup;});
  if($('support')) $('support').href = c.supportEmail ? `mailto:${c.supportEmail}` : (hr && hr !== '#' ? hr + '/support' : '#');

  const nativeOrWeb = (id, url, label) => {
    const el=$(id); if(!el) return;
    if(url){el.href=url;el.textContent=label;el.classList.remove('btn-soft');el.classList.add('btn-primary');el.setAttribute('download','');}
    else {el.href=hr||'#';}
  };
  nativeOrWeb('androidButton',c.androidApk,'Download Android APK');
  nativeOrWeb('windowsButton',c.windowsExe,'Download Windows App');

  $('year').textContent = new Date().getFullYear();

  const menu=$('menuButton'), mobile=$('mobileMenu');
  if(menu&&mobile){menu.addEventListener('click',()=>{const open=mobile.classList.toggle('open');menu.setAttribute('aria-expanded',String(open));});mobile.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{mobile.classList.remove('open');menu.setAttribute('aria-expanded','false');}));}

  const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');observer.unobserve(e.target);}});},{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

  const buttons=[...document.querySelectorAll('[data-view]')];
  buttons.forEach(btn=>btn.addEventListener('click',()=>{
    buttons.forEach(b=>b.classList.toggle('active',b===btn));
    document.querySelectorAll('[data-preview]').forEach(p=>p.classList.toggle('active-preview',p.dataset.preview===btn.dataset.view));
  }));

  // Gentle parallax for the hero dashboard on capable pointers.
  const stage=document.querySelector('.hero-stage');
  if(stage && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    stage.addEventListener('mousemove',e=>{
      const r=stage.getBoundingClientRect();
      const x=(e.clientX-r.left)/r.width-.5, y=(e.clientY-r.top)/r.height-.5;
      const dash=stage.querySelector('.dashboard-window');
      const phone=stage.querySelector('.mobile-device');
      if(dash) dash.style.transform=`translate(${x*6}px,${y*5}px)`;
      if(phone) phone.style.transform=`rotate(2deg) translate(${x*-5}px,${y*-4}px)`;
    });
    stage.addEventListener('mouseleave',()=>{const dash=stage.querySelector('.dashboard-window');const phone=stage.querySelector('.mobile-device');if(dash)dash.style.transform='';if(phone)phone.style.transform='rotate(2deg)';});
  }
})();
