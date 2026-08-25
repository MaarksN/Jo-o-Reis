const PUBLIC_USERS_DECLARATION = "const USERS=[{email:'joao.reis@atlasgr.com.br',role:'USUARIO',nome:'João Reis'},{email:'marcelo.nascimento@atlasgr.com.br',role:'ADM_SUPERVISOR',nome:'Marcelo Nascimento'}];";

const LEGACY_USERS_PATTERN = /const USERS=\[\{email:'joao\.reis@atlasgr\.com\.br',pass:'[^']*',role:'USUARIO',nome:'João Reis'\},\{email:'marcelo\.nascimento@atlasgr\.com\.br',pass:'[^']*',role:'ADM_SUPERVISOR',nome:'Marcelo Nascimento'\}\];/;
const PUBLIC_USERS_PATTERN = /const USERS=\[\{email:'joao\.reis@atlasgr\.com\.br',role:'USUARIO',nome:'João Reis'\},\{email:'marcelo\.nascimento@atlasgr\.com\.br',role:'ADM_SUPERVISOR',nome:'Marcelo Nascimento'\}\];/;
const LEGACY_CALL_PATTERN = /async function call\(method,params=\{\}\)\{[\s\S]*?\}\nfunction setConn\(ok,s\)/;
const LEGACY_TEST_CONNECTION_PATTERN = /async function testConn\(\)\{[\s\S]*?\}\nasync function listCurrentLeads\(\)/;

const LEGACY_LOAD_AUTH = "function loadAuth(){try{return JSON.parse(localStorage.getItem(AUTHK)||'null')}catch(e){return null}}";
const LEGACY_SAVE_AUTH = 'function saveAuth(u){localStorage.setItem(AUTHK,JSON.stringify(u))}';
const LEGACY_LOGOUT = 'function doLogout(){localStorage.removeItem(AUTHK);location.reload()}';
const LEGACY_LOGIN = "function doLogin(){const email=(document.getElementById('loginEmail').value||'').trim().toLowerCase(),pass=document.getElementById('loginPass').value||'';const u=USERS.find(x=>x.email===email&&x.pass===pass);const err=document.getElementById('loginError');if(!u){err.classList.remove('hidden');return}err.classList.add('hidden');const auth={email:u.email,role:u.role,nome:u.nome};saveAuth(auth);enter(auth)}";

const SECURE_LOGIN = `async function doLogin(){
  const email=(document.getElementById('loginEmail').value||'').trim().toLowerCase();
  const pass=document.getElementById('loginPass').value||'';
  const err=document.getElementById('loginError');
  try{
    const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({email,password:pass})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.user){err.textContent=data.error||'Login inválido.';err.classList.remove('hidden');return}
    err.classList.add('hidden');
    enter(data.user);
  }catch(e){err.textContent='Não foi possível autenticar no servidor.';err.classList.remove('hidden')}
}`;

const SECURE_LOGOUT = "async function doLogout(){try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'})}catch(e){}localStorage.removeItem(AUTHK);location.reload()}";

const SECURE_CALL = `async function call(method,params={}){
  if(!window.bitrixService)throw Error('Serviço Bitrix seguro indisponível. Recarregue a aplicação.');
  const hook=document.getElementById('hook')?.value?.trim();
  if(hook)window.bitrixService.setWebhook(hook);
  return await window.bitrixService.call(method,params)
}
function setConn(ok,s)`;

const SECURE_TEST_CONNECTION = `async function testConn(){
  try{
    if(!window.bitrixService)throw Error('Serviço Bitrix seguro indisponível.');
    const hook=document.getElementById('hook')?.value?.trim();
    if(hook)window.bitrixService.setWebhook(hook);
    const res=await window.bitrixService.testConnection();
    if(res.ok){
      setConn(true,\`Conectado com sucesso ao Bitrix24 (\${res.latency}ms).\`);
      toast(\`Conectado ao Bitrix (\${res.latency}ms)!\`);
      return
    }
    setConn(false,res.error);
    toast(res.error)
  }catch(e){setConn(false,e.message);toast(e.message)}
}
async function listCurrentLeads()`;

const LEGACY_START_PATTERN = /\(function start\(\)\{\s*const savedTheme=window\.storageManager\?window\.storageManager\.loadTheme\(\):localStorage\.getItem\(K\.theme\);[\s\S]*?const auth=loadAuth\(\);\s*if\(auth&&USERS\.some\(u=>u\.email===auth\.email&&u\.role===auth\.role\)\)enter\(auth\);\s*\}\)\(\);/;

const SECURE_START = `(async function start(){
  const savedTheme=window.storageManager?window.storageManager.loadTheme():localStorage.getItem(K.theme);
  document.documentElement.setAttribute('data-theme',savedTheme||((matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light'));
  try{
    const response=await fetch('/api/auth/session',{credentials:'same-origin'});
    if(response.ok){const data=await response.json();if(data?.user)enter(data.user)}
  }catch(e){}
})();`;

function replaceExact(source, search, replacement, label) {
  if (!source.includes(search)) {
    throw new Error(`Secure HTML transform failed: ${label} signature not found`);
  }
  return source.replace(search, replacement);
}

function replacePattern(source, pattern, replacement, label) {
  if (!pattern.test(source)) {
    throw new Error(`Secure HTML transform failed: ${label} signature not found`);
  }
  return source.replace(pattern, replacement);
}

export function transformRuntimeHtml(html) {
  let output = String(html || '');

  if (LEGACY_USERS_PATTERN.test(output)) {
    output = output.replace(LEGACY_USERS_PATTERN, PUBLIC_USERS_DECLARATION);
  } else if (!PUBLIC_USERS_PATTERN.test(output)) {
    throw new Error('Secure HTML transform failed: recognized USERS declaration not found');
  }

  output = replaceExact(output, LEGACY_LOAD_AUTH, 'function loadAuth(){return null}', 'loadAuth');
  output = replaceExact(output, LEGACY_SAVE_AUTH, 'function saveAuth(){return null}', 'saveAuth');
  output = replaceExact(output, LEGACY_LOGIN, SECURE_LOGIN, 'doLogin');
  output = replaceExact(output, LEGACY_LOGOUT, SECURE_LOGOUT, 'doLogout');
  output = replacePattern(output, LEGACY_CALL_PATTERN, SECURE_CALL, 'Bitrix call');
  output = replacePattern(output, LEGACY_TEST_CONNECTION_PATTERN, SECURE_TEST_CONNECTION, 'testConn');

  if (!LEGACY_START_PATTERN.test(output)) {
    throw new Error('Secure HTML transform failed: startup signature not found');
  }
  output = output.replace(LEGACY_START_PATTERN, SECURE_START);

  if (/const USERS=\[[^\n]*pass:/.test(output) || output.includes("pass:'00000000'")) {
    throw new Error('Secure HTML transform failed: client-side password remained in output');
  }
  if (!output.includes('/api/auth/login') || !output.includes('/api/auth/session')) {
    throw new Error('Secure HTML transform failed: server auth hooks missing');
  }
  if (output.includes('const r=await fetch(`${normHook()}/${method}.json`')) {
    throw new Error('Secure HTML transform failed: direct Bitrix fallback remained in output');
  }

  return output;
}
