import { useEffect, useState } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Station } from '../services/api';
import { formatDate } from '../utils/format';
import { formattedMeasure } from './MeasurementCharts';

type Week = { semana: string; notificacoes: number; temperatura_c: number | null; umidade_pct: number | null; chuva_mm: number | null; vento_ms: number | null };
type Prediction = { semana_alvo: string; observado: number; persistencia_t: number; INMET: number; SINAN: number; 'INMET + SINAN': number };
type Manifest = { municipio_ibge_6: string; campo_municipio: string; campo_data: string; estacao_escolhida: string; horizonte_semanas: number };
type Bundle = { manifesto: Manifest; serie: Week[]; previsoes: Prediction[] };
type Forecast = { origem: string; modo: 'epi'|'hybrid'; modelo: string; faixa: string; previsoes: { horizonte: number; semana: string; previsto: number; inferior: number; superior: number; mae_teste: number; mae_persistencia: number }[] };
function validateForecast(raw: unknown): Forecast {
  const f=raw as Forecast;
  if(!f || !dateValid(f.origem) || !['epi','hybrid'].includes(f.modo) || !Array.isArray(f.previsoes) || f.previsoes.length!==5) throw Error('Previsão incompatível');
  for(const [i,r] of f.previsoes.entries()){
    const d=new Date(f.origem+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()+7*(i+1));
    if(r.horizonte!==i+1 || r.semana!==d.toISOString().slice(0,10) || ![r.previsto,r.inferior,r.superior,r.mae_teste,r.mae_persistencia].every(nonnegative) || r.inferior>r.previsto || r.superior<r.previsto) throw Error('Previsão inválida');
  }
  return f;
}
const models = ['persistencia_t','INMET','SINAN','INMET + SINAN'] as const;
const colors = ['#8b98a9','#e99b55','#55b3e6','#a38af5'];
function dateValid(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
}
function nonnegative(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= 0; }
function validate(raw: unknown): Bundle {
  const b = raw as Bundle;
  if (!b || b.manifesto?.municipio_ibge_6 !== '354980' || b.manifesto.campo_municipio !== 'residencia' || b.manifesto.campo_data !== 'DT_NOTIFIC' || b.manifesto.horizonte_semanas !== 5 || typeof b.manifesto.estacao_escolhida !== 'string') throw Error('Manifesto incompatível: use o recorte padrão de residência, data de notificação e horizonte de cinco semanas.');
  if (!Array.isArray(b.serie) || !b.serie.length || b.serie.length > 2000 || !Array.isArray(b.previsoes) || b.previsoes.length > 2000) throw Error('Séries ausentes ou inválidas.');
  const weeks = new Set<string>();
  for (const row of b.serie) {
    if (!dateValid(row.semana) || weeks.has(row.semana) || !Number.isSafeInteger(row.notificacoes) || row.notificacoes < 0) throw Error('Semana duplicada ou notificações inválidas.');
    weeks.add(row.semana);
    for (const key of ['temperatura_c','umidade_pct','chuva_mm','vento_ms'] as const) if (row[key] !== null && (typeof row[key] !== 'number' || !Number.isFinite(row[key]))) throw Error('Valor climático inválido.');
  }
  const targets = new Set<string>();
  for (const row of b.previsoes) {
    if (!dateValid(row.semana_alvo) || targets.has(row.semana_alvo) || !nonnegative(row.observado) || models.some(m => !nonnegative(row[m]))) throw Error('Previsão inválida ou duplicada.');
    targets.add(row.semana_alvo);
  }
  return { ...b, serie: [...b.serie].sort((a,c)=>a.semana.localeCompare(c.semana)), previsoes: [...b.previsoes].sort((a,c)=>a.semana_alvo.localeCompare(c.semana_alvo)) };
}
export function EpidemiologyLab({ stations }: { stations: Station[] }) {
  const reference = stations.find(s => s.slug.trim().toUpperCase() === 'E01');
  const sensor = reference?.latestSensorPayload;
  const fresh = reference?.computedStatus === 'ONLINE' && typeof reference.secondsSinceLastData === 'number' && reference.secondsSinceLastData <= 2400;
  const validDht = !(sensor?.temperatura === 0 && sensor?.umidade === 0);
  const [bundle,setBundle] = useState<Bundle|null>(null);
  const [forecast,setForecast] = useState<Forecast|null>(null);
  const [serverError,setServerError] = useState('');
  const [revision,setRevision] = useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    const base=import.meta.env.VITE_API_URL ?? '/api';
    setServerError('');
    setForecast(null);
    async function read(name:string){
      const r=await fetch(base+'/epidemiology/'+name,{credentials:'same-origin',signal:controller.signal,cache:'no-store'});
      if(!r.ok) throw Error(name+' · HTTP '+r.status);
      return r.json();
    }
    void read('history').then(v=>{if(!controller.signal.aborted){setBundle(validate(v));setYear('all');}}).catch(e=>{if(!controller.signal.aborted)setServerError(String(e));});
    void read('forecast').then(v=>{if(!controller.signal.aborted)setForecast(validateForecast(v));}).catch(e=>{if(!controller.signal.aborted)setServerError(old=>[old,String(e)].filter(Boolean).join(' | '));});
    return ()=>controller.abort();
  },[revision]);
  const [error,setError] = useState('');
  const [year,setYear] = useState('all');
  const [climate,setClimate] = useState<'temperatura_c'|'umidade_pct'|'chuva_mm'|'vento_ms'>('temperatura_c');
  const [model,setModel] = useState<typeof models[number]>('INMET + SINAN');
  const [lag,setLag] = useState(0);
  const series = bundle?.serie ?? [];
  const years = [...new Set(series.map(r=>r.semana.slice(0,4)))];
  const filtered = series.filter(r=>year==='all'||r.semana.startsWith(year));
  const climateLabels = {temperatura_c:'Temperatura (°C)',umidade_pct:'Umidade (%)',chuva_mm:'Chuva (mm)',vento_ms:'Vento (m/s)'};
  const byDate = new Map(series.map(r=>[r.semana,r]));
  const paired = filtered.map(r=> {
    const d = new Date(r.semana+'T00:00:00Z'); d.setUTCDate(d.getUTCDate()-lag*7);
    return {...r, clima: byDate.get(d.toISOString().slice(0,10))?.[climate] ?? null};
  });
  const test = (bundle?.previsoes ?? []).filter(r=>year==='all'||r.semana_alvo.startsWith(year));
  const mae = test.length ? test.reduce((s,r)=>s+Math.abs(r.observado-r[model]),0)/test.length : null;
  const peak = filtered.reduce<Week|null>((best,r)=>!best||r.notificacoes>best.notificacoes?r:best,null);
  async function load(file: File) {
    try { if(file.size>5_000_000) throw Error('Arquivo maior que 5 MB.'); const b=validate(JSON.parse(await file.text())); setBundle(b);setYear('all');setError(''); }
    catch(e){setError(e instanceof Error?e.message:'Arquivo inválido');}
  }
  return <div className="epi-lab">
    <section className="card epi-import"><h2>Laboratório epidemiológico · experimental</h2><p>Dados agregados carregados do servidor. A importação manual é opcional e temporária. Nenhum registro individual é necessário.</p>
      <button type="button" onClick={()=>setRevision(n=>n+1)}>Atualizar dados do servidor</button>{serverError&&<p role="alert">{serverError}</p>}<label>Resultados INMET + SINAN <input type="file" accept=".json,application/json" onChange={e=>{const f=e.target.files?.[0];if(f)void load(f);}}/></label>
      {error&&<p role="alert">{error}</p>}
      {bundle&&<p>Residência em SJRP · DT_NOTIFIC · INMET {bundle.manifesto.estacao_escolhida} · horizonte de 5 semanas</p>}
      <p>Notificações não equivalem a infecções confirmadas. Resultados retrospectivos não constituem alerta operacional.</p>
    </section>
    <section className="card epi-chart"><h2>Referência climática municipal · E01</h2><p>São José do Rio Preto como unidade única de análise. A estação E01 é uma aproximação provisória das condições municipais, não uma média espacial. O histórico INMET permanece separado para treinamento e avaliação.</p><p>{!reference ? "E01 não encontrada." : fresh ? "Estação online · leitura recente" : "Leitura indisponível ou desatualizada"} · Último dado recebido: {formatDate(reference?.lastDataReceivedAt)}</p><div className="epi-kpis">{[["Temperatura",formattedMeasure(fresh && validDht ? sensor?.temperatura : null,"°C")],["Umidade",formattedMeasure(fresh && validDht ? sensor?.umidade : null,"%")],["Vento",formattedMeasure(fresh && typeof sensor?.vel_vento === "number" && sensor.vel_vento >= 0 ? sensor.vel_vento : null,"km/h")],["MQ-135 · bruto",formattedMeasure(fresh ? sensor?.qual_ar : null,"índice")]].map(([label,value])=><article className="card" key={label}><small>{label}</small><strong>{value}</strong></article>)}</div><p>Leituras atuais não são inseridas nas séries históricas nem usadas automaticamente para inferência. Precipitação em mm exige calibração do pluviômetro.</p></section>
    <section className="card epi-chart"><h2>Projeção municipal · cinco horizontes</h2>
      {!forecast ? <p>Execute o motor no servidor e atualize os dados.</p> : <>
      <p>Origem: {forecast.origem} · {forecast.modo==='epi'?'SINAN + sazonalidade (sem IoT na inferência)':'Clima híbrido + SINAN'} · Prova de conceito. Semanas passadas sem observação são estimativas retrospectivas de atualização, não previsões novas.</p>
      <p>Faixa experimental: percentil 90 dos erros absolutos no teste; sem garantia de cobertura. Não constitui alerta operacional.</p>
      <ResponsiveContainer width="100%" height={260}><LineChart data={forecast.previsoes}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="semana"/><YAxis/><Tooltip/><Legend/><Line dataKey="previsto" name="Estimativa" stroke="#a38af5" strokeWidth={3}/><Line dataKey="inferior" name="Limite inferior" stroke="#8b98a9" strokeDasharray="4 4" dot={false}/><Line dataKey="superior" name="Limite superior" stroke="#8b98a9" strokeDasharray="4 4" dot={false}/></LineChart></ResponsiveContainer>
      <div style={{overflowX:'auto'}}><table><thead><tr><th>Horizonte</th><th>Semana</th><th>Estimativa</th><th>MAE teste</th><th>MAE persistência</th></tr></thead><tbody>{forecast.previsoes.map(r=><tr key={r.horizonte}><td>t+{r.horizonte}</td><td>{r.semana}</td><td>{Math.round(r.previsto)}</td><td>{r.mae_teste.toFixed(2)}</td><td>{r.mae_persistencia.toFixed(2)}</td></tr>)}</tbody></table></div>
      {forecast.previsoes.some(r=>r.mae_teste>r.mae_persistencia)&&<p>A persistência superou o modelo em pelo menos um horizonte. Avaliação experimental, não recomendada para decisões operacionais.</p>}
      </>}
    </section>
    {bundle&&<>
      <section className="card epi-filters"><label>Ano da semana-alvo / observada <select value={year} onChange={e=>setYear(e.target.value)}><option value="all">Todo o histórico</option>{years.map(y=><option key={y}>{y}</option>)}</select></label></section>
      <div className="epi-kpis">{[['Notificações no recorte',filtered.length?filtered.reduce((s,r)=>s+r.notificacoes,0).toLocaleString('pt-BR'):'—'],['Maior semana observada',peak?peak.notificacoes.toLocaleString('pt-BR'):'—'],['Semana do pico',peak?.semana??'—'],['Semanas disponíveis',String(filtered.length)]].map(([label,value])=><article className="card" key={label}><small>{label}</small><strong>{value}</strong></article>)}</div>
      <section className="card epi-chart"><h2>Notificações semanais · SINAN · município de residência</h2><ResponsiveContainer width="100%" height={240}><AreaChart data={filtered}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="semana" minTickGap={45}/><YAxis/><Tooltip/><Area dataKey="notificacoes" stroke="#df7777" fill="#df777733" connectNulls={false} isAnimationActive={false}/></AreaChart></ResponsiveContainer></section>
      <section className="card epi-chart"><h2>Clima antecedente · histórico importado</h2><div className="epi-filters"><label>Variável <select value={climate} onChange={e=>setClimate(e.target.value as typeof climate)}>{Object.entries(climateLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Defasagem <select value={lag} onChange={e=>setLag(Number(e.target.value))}>{[0,1,2,3,4,6,8].map(n=><option key={n} value={n}>{n} semana(s)</option>)}</select></label></div><p>Mesmo eixo temporal do gráfico acima; clima da semana t−defasagem. Comparação visual não implica causalidade.</p><ResponsiveContainer width="100%" height={190}><LineChart data={paired}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="semana" minTickGap={45}/><YAxis/><Tooltip/><Line name={climateLabels[climate]} dataKey="clima" stroke="#55b3e6" dot={false} connectNulls={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></section>
      <section className="card epi-chart"><h2>Teste retrospectivo · previsão t+5</h2><label>Modelo <select value={model} onChange={e=>setModel(e.target.value as typeof model)}>{models.map(m=><option key={m} value={m}>{m==='persistencia_t'?'Persistência':m}</option>)}</select></label><p>MAE no recorte: {mae===null?'—':mae.toFixed(2)} notificações/semana · não é previsão futura em tempo real.</p><ResponsiveContainer width="100%" height={240}><LineChart data={test}><CartesianGrid vertical={false} stroke="var(--border)"/><XAxis dataKey="semana_alvo" minTickGap={45}/><YAxis/><Tooltip/><Legend/><Line name="Observado" dataKey="observado" stroke="#df7777" dot={false} isAnimationActive={false}/><Line name={model} dataKey={model} stroke={colors[models.indexOf(model)]} dot={false} isAnimationActive={false}/></LineChart></ResponsiveContainer></section>
    </>}

  </div>;
}
