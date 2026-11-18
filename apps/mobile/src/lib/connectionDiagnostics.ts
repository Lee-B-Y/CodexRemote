interface BridgeHealth {ok?:boolean;desktopIpcReady?:boolean;}
interface CloudDiagnostics {generated_at?:string;tunnelListening?:boolean;}

export function connectionDiagnosis(edge:boolean,health:BridgeHealth|null,cloud?:CloudDiagnostics|null):string{
  if(health){
    if(!health.ok)return '本机 Bridge 可达；辅助 App Server 未就绪';
    if(!health.desktopIpcReady)return 'SSH / Bridge / App Server 正常；桌面 IPC 未就绪，请确认桌面用户已登录且 Codex 桌面在运行';
    return 'HTTPS / SSH / Bridge / Codex 正常；请检查 WebSocket 通路、配对令牌和客户端来源';
  }
  const age=Date.now()-Date.parse(cloud?.generated_at??'');
  if(edge&&age>=-30000&&age<90000){
    if(cloud?.tunnelListening===false)return '云端 HTTPS 入口正常；SSH 反向入口未建立，请检查电脑隧道任务';
    if(cloud?.tunnelListening===true)return '云端 HTTPS / SSH 监听存在；本机 Bridge 当前不可达，请检查隧道连接和电脑 Bridge';
  }
  return edge?'云端 HTTPS 入口正常；SSH 隧道或本机 Bridge 不可达':'域名 / TLS / 网络检查未通过，HTTPS 入口不可达';
}

export async function diagnoseConnection(serverUrl:string):Promise<string>{
  const base=new URL(serverUrl);base.protocol=base.protocol==='wss:'?'https:':base.protocol==='ws:'?'http:':base.protocol;
  const get=async(route:string)=>{
    try{
      const response=await fetch(new URL(route,base),{cache:'no-store',signal:AbortSignal.timeout(4500)});
      const value:unknown=await response.json();
      return value&&typeof value==='object'?value as Record<string,unknown>:null;
    }catch{return null;}
  };
  const [edge,health,cloud]=await Promise.all([get('/edge-health'),get('/health'),get('/diagnostics')]);
  return connectionDiagnosis(edge?.ok===true,health?.service==='codex-mobile-remote'?health as BridgeHealth:null,cloud as CloudDiagnostics|null);
}
