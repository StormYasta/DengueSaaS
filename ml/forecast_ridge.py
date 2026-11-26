"""Ridge t+4, reproduzindo atributos de Untitled1.ipynb.
Entrada: base diária regional do EdaSinan, não a série DT_NOTIFIC.
"""
import argparse
import json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import r2_score, mean_absolute_error, mean_squared_error

FEATURES = ["sin_sem","cos_sem",*[f"cresc_{k}sem" for k in range(1,5)],"aceleracao","chuva_4sem","temp_min_4sem","umid_4sem"]

def run(path, cutoff):
    d = pd.read_parquet(path) if path.endswith(".parquet") else pd.read_csv(path)
    d["Data"] = pd.to_datetime(d["Data"], errors="raise").dt.normalize()
    cols = ["casos_total","Precipitacao_mm","Temp_Min_C","Umidade_Relativa_Pct"]
    d = d[["Data","Regiao",*cols]].copy()
    for c in cols: d[c] = pd.to_numeric(d[c], errors="raise")
    if d.duplicated(["Data","Regiao"]).any() or d[cols].isna().any().any() or (d.casos_total<0).any():
        raise ValueError("Base regional inválida ou incompleta")
    cutoff = pd.Timestamp(cutoff)
    if cutoff.dayofweek!=6: raise ValueError("Corte deve ser domingo (W-SUN)")
    d = d[d.Data<=cutoff]
    if d.empty: raise ValueError("Sem dados")
    regions=d.Regiao.nunique()
    if regions!=7: raise ValueError("Esperadas sete regiões do treinamento original")
    daily=d.groupby("Data").agg(casos=("casos_total","sum"),chuva=("Precipitacao_mm","sum"),temp_min=("Temp_Min_C","mean"),umid=("Umidade_Relativa_Pct","mean"),n=("Regiao","nunique"))
    daily=daily.asfreq("D")
    if not daily.n.eq(regions).all(): raise ValueError("Dias ou regiões ausentes; não preencher artificialmente")
    w=daily.resample("W-SUN").agg({"casos":"sum","chuva":"sum","temp_min":"mean","umid":"mean","n":"count"})
    w=w[w.n.eq(7)].drop(columns="n").asfreq("W-SUN")
    if w.empty or w.index[-1]!=cutoff: raise ValueError("Origem sem semana completa; atualize a base regional")
    if w.isna().any().any(): raise ValueError("Lacuna semanal")
    log=np.log1p(w.casos)
    week=w.index.isocalendar().week.astype(int).to_numpy()
    x=pd.DataFrame(index=w.index)
    x["sin_sem"]=np.sin(2*np.pi*week/52)
    x["cos_sem"]=np.cos(2*np.pi*week/52)
    for k in range(1,5): x[f"cresc_{k}sem"]=log.diff(k)
    x["aceleracao"]=x.cresc_1sem.diff()
    x["chuva_4sem"]=w.chuva.rolling(4).sum()
    x["temp_min_4sem"]=w.temp_min.rolling(4).mean()
    x["umid_4sem"]=w.umid.rolling(4).mean()
    y=w.casos.shift(-4)
    z=np.log1p(y)-log
    target=x.index+pd.Timedelta(weeks=4)
    valid=x.notna().all(axis=1)&y.notna()
    test=valid&(target>=pd.Timestamp("2024-01-01"))&(target<pd.Timestamp("2025-01-01"))
    if test.sum()<10: raise ValueError("Base insuficiente para avaliação 2024")
    train=valid&(target<x.index[test][0])&(x.index>=pd.Timestamp("2019-01-01"))
    model=make_pipeline(StandardScaler(),Ridge(alpha=100))
    model.fit(x.loc[train,FEATURES],z[train])
    pred=np.maximum(0,np.expm1(log[test]+model.predict(x.loc[test,FEATURES])))
    actual=y[test]
    mae=float(mean_absolute_error(actual,pred))
    base=float(mean_absolute_error(actual,w.casos[test]))
    # Mantém o modelo avaliado congelado: não inclui 2024/2025 no ajuste.
    value=float(max(0,np.expm1(log.iloc[-1]+model.predict(x.loc[[cutoff],FEATURES])[0])))
    return {"modelo":"Ridge delta log t+4 (treino anterior a 2024)","modo":"hybrid","origem":str(cutoff.date()),"faixa":"indisponível","definicao_alvo":"Casos classificados 10/11/12; município de notificação; DT_SIN_PRI; W-SUN; sete regiões","historico_recente":[{"semana":str(i.date()),"observado":float(v)} for i,v in w.casos.tail(12).items()],"previsoes":[{"horizonte":4,"semana":str((cutoff+pd.Timedelta(weeks=4)).date()),"previsto":value,"inferior":None,"superior":None,"mae_teste":mae,"mae_persistencia":base,"r2":float(r2_score(actual,pred)),"rmse":float(np.sqrt(mean_squared_error(actual,pred))),"skill":100*(1-mae/base) if base else None,"n_teste":int(test.sum()),"teste_inicio":str(target[test][0].date()),"teste_fim":str(target[test][-1].date())}]}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--base",required=True)
    p.add_argument("--corte",required=True)
    p.add_argument("--saida",required=True)
    a=p.parse_args()
    result=run(a.base,a.corte)
    out=Path(a.saida)
    tmp=out.with_suffix(".tmp")
    tmp.write_text(json.dumps(result,ensure_ascii=False,indent=2,allow_nan=False),encoding="utf8")
    tmp.replace(out)
    print(json.dumps(result,ensure_ascii=False,indent=2))
