import type { FastifyInstance } from 'fastify';
import { readFile } from 'node:fs/promises';
import { prisma } from '../lib/prisma.js';

const metrics = ['temperatura_c','umidade_pct','vento_ms'] as const;
type Metric = typeof metrics[number];
type Reading = { value:number; hours:number; source:string };
type Week = { semana:string } & Partial<Record<Metric,Reading>>;
const hourMs=3600000;
function weekEnd(at:number){
  // 2026 em São Paulo: UTC-3, sem horário de verão.
  const d=new Date(at-3*hourMs);
  d.setUTCDate(d.getUTCDate()+6-d.getUTCDay());
  return d.toISOString().slice(0,10);
}
export async function epiClimateRoutes(app:FastifyInstance){
  app.get('/epidemiology/climate',async (_request,reply)=>{
    const weeks=new Map<string,Week>();
    function put(date:string,key:Metric,value:number,hours:number,source:string){
      if(!Number.isFinite(value)||hours<126||hours>168) return;
      const row=weeks.get(date)??{semana:date};
      row[key]={value,hours,source}; weeks.set(date,row);
    }
    try{
      const csv=await readFile('/epidemiology/data/dengueops_clima_iot_semanal.csv','utf8');
      const [header,...lines]=csv.trim().split(/\r?\n/);
      const cols=header.split(',');
      for(const line of lines){
        const fields=line.split(',');
        const get=(k:string)=>fields[cols.indexOf(k)];
        const date=get('semana');
        if(!date||!/^2026-\d\d-\d\d$/.test(date)) continue;
        for(const key of ['temperatura_c','umidade_pct'] as const){
          const v=get(key); if(v?.trim()) put(date,key,Number(v),Number(get(key+'_horas')),'IoT histórico');
        }
      }
    }catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
    const station=await prisma.station.findFirst({where:{slug:'E01'},select:{id:true}});
    const hours=new Map<string,{sum:number;count:number}>();
    if(station){
      const events=await prisma.event.findMany({where:{stationId:station.id,type:'SENSOR_PAYLOAD',createdAt:{gte:new Date('2026-01-01T00:00:00Z')}},select:{createdAt:true,metadata:true},take:100001,orderBy:{createdAt:'asc'}});
      if(events.length>100000)return reply.code(413).send({message:'Histórico IoT excede limite de consulta'});
      for(const e of events){
        if(!e.metadata||typeof e.metadata!=='object'||Array.isArray(e.metadata))continue;
        const p=e.metadata as Record<string,unknown>;
        const at=typeof p.collectedAt==='string'?Date.parse(p.collectedAt):e.createdAt.getTime();
        if(!Number.isFinite(at)||at>Date.now()||at<Date.parse('2026-01-01T00:00:00Z'))continue;
        const t=p.temperatura,u=p.umidade,w=p.vel_vento;
        const bad=t===0&&u===0;
        const values=[!bad&&typeof t==='number'&&t>=-10&&t<=60?t:null,!bad&&typeof u==='number'&&u>=0&&u<=100?u:null,typeof w==='number'&&w>=0&&w<=250?w/3.6:null];
        metrics.forEach((key,i)=>{const v=values[i];if(v===null)return;const k=key+'|'+Math.floor(at/hourMs);const a=hours.get(k)??{sum:0,count:0};a.sum+=v;a.count++;hours.set(k,a);});
      }
    }
    const grouped=new Map<string,{sum:number;count:number}>();
    for(const [key,a] of hours){const [metric,h]=key.split('|');const date=weekEnd(Number(h)*hourMs);const k=date+'|'+metric;const g=grouped.get(k)??{sum:0,count:0};g.sum+=a.sum/a.count;g.count++;grouped.set(k,g);}
    for(const [key,g] of grouped){const [date,metric]=key.split('|');if(date>=weekEnd(Date.now()))continue;put(date,metric as Metric,g.sum/g.count,g.count,'E01 PostgreSQL');}
    return reply.header('Cache-Control','no-store').send([...weeks.values()].sort((a,b)=>a.semana.localeCompare(b.semana)));
  });
}
