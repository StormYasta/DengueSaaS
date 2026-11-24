"""Previsão municipal experimental: cinco horizontes diretos.
Entrada CSV semanal W-SAT, com notificações e clima; IoT opcional.
Não preenche semanas epidemiológicas desconhecidas com zero.
"""
import argparse, json
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.ensemble import HistGradientBoostingRegressor

CLIMATE = ["temperatura_c","umidade_pct","chuva_mm","vento_ms"]

def run(history, iot, cutoff, mode='auto'):
    data = pd.read_csv(history, parse_dates=["semana"]).sort_values("semana")
    if data.semana.duplicated().any() or not data.semana.dt.dayofweek.eq(5).all():
        raise ValueError("Esperadas semanas únicas encerradas no sábado")
    cutoff = pd.Timestamp(cutoff)
    if cutoff.dayofweek != 5:
        raise ValueError("Data de corte deve ser sábado")
    data = data[data.semana <= cutoff].set_index("semana").asfreq("W-SAT")
    if data.empty or data.index[-1] != cutoff or pd.isna(data.iloc[-1]["notificacoes"]):
        raise ValueError("Origem sem notificações disponíveis")
    for col in CLIMATE + ["notificacoes"]:
        data[col] = pd.to_numeric(data[col], errors="coerce")
    if (data.notificacoes.dropna() < 0).any():
        raise ValueError("Notificações negativas")
    sources = {}
    for col in CLIMATE:
        sources[col] = int(data[col].notna().sum())
    replaced = {}
    if iot:
        local = pd.read_csv(iot, parse_dates=["semana"]).set_index("semana").reindex(data.index)
        for col in ["temperatura_c","umidade_pct"]:
            valid = local[col].notna() & local[col+"_horas"].ge(126)
            valid &= local[col].between(-10,60) if col=="temperatura_c" else local[col].between(0,100)
            data.loc[valid,col] = local.loc[valid,col]
            replaced[col] = int(valid.sum())
    x = pd.DataFrame(index=data.index)
    w = data.index.isocalendar().week.to_numpy(dtype=float)
    x["seno"] = np.sin(2*np.pi*w/52.18)
    x["cosseno"] = np.cos(2*np.pi*w/52.18)
    for col in CLIMATE:
        for lag in [0,1,2,3,4,6,8]:
            x[f"{col}_lag{lag}"] = data[col].shift(lag)
    for n in [4,8]:
        x[f"chuva_acum_{n}"] = data.chuva_mm.rolling(n,min_periods=n).sum()
        x[f"casos_media_{n}"] = data.notificacoes.rolling(n,min_periods=n).mean()
    for lag in [0,1,2,3,4,8,12,52]:
        x[f"casos_lag{lag}"] = data.notificacoes.shift(lag)
    epi = [c for c in x.columns if c.startswith("casos_") or c in ["seno","cosseno"]]
    climate_ready = not x.iloc[-1].isna().any() and all(data[c].notna().mean()>=.5 for c in CLIMATE)
    if mode == "hybrid" and not climate_ready:
        raise ValueError("Cobertura climática insuficiente para modo híbrido")
    used = "hybrid" if mode != "epi" and climate_ready else "epi"
    if used == "epi": x = x[epi]
    if x.iloc[-1].isna().any(): raise ValueError("Origem sem defasagens epidemiológicas completas")
    def model():
        return Pipeline([("imputer",SimpleImputer(strategy="median",add_indicator=True,keep_empty_features=True)),("model",HistGradientBoostingRegressor(max_iter=180,learning_rate=.05,max_depth=3,min_samples_leaf=12,l2_regularization=1.,random_state=42,early_stopping=False))])
    result=[]
    for h in range(1,6):
        y=data.notificacoes.shift(-h)
        eligible = y.notna() & x[epi].notna().all(axis=1)
        indices=x.index[eligible]
        if len(indices)<180: raise ValueError("Histórico insuficiente")
        # Holdout cronológico, embargo pelo horizonte; resíduos não são garantia de cobertura futura.
        test=indices[-52:]
        train=indices[indices+pd.Timedelta(weeks=h)<test[0]]
        m=model().fit(x.loc[train],y.loc[train])
        pred=np.maximum(0,m.predict(x.loc[test]))
        errors=np.abs(y.loc[test].to_numpy()-pred)
        baseline=float(np.mean(np.abs(y.loc[test]-data.notificacoes.loc[test])))
        m=model().fit(x.loc[indices],y.loc[indices])
        p=float(max(0,m.predict(x.iloc[[-1]])[0]))
        radius=float(np.quantile(errors,.9))
        result.append({"horizonte":h,"semana":str((cutoff+pd.Timedelta(weeks=h)).date()),"previsto":round(p,1),"inferior":round(max(0,p-radius),1),"superior":round(p+radius,1),"mae_teste":round(float(errors.mean()),2),"mae_persistencia":round(baseline,2)})
    return {"modelo":"HistGradientBoostingRegressor","modo":used,"substituicoes_utilizadas_no_modelo":replaced if used=="hybrid" else {},"origem":str(cutoff.date()),"experimental":True,"faixa":"percentil 90 dos erros absolutos no holdout; sem garantia de cobertura","substituicoes_iot":replaced,"previsoes":result}

if __name__=="__main__":
    p=argparse.ArgumentParser()
    p.add_argument("--historico",required=True)
    p.add_argument("--iot")
    p.add_argument("--modo",choices=["auto","epi","hybrid"],default="auto")
    p.add_argument("--corte",required=True)
    p.add_argument("--saida",default="previsao.json")
    a=p.parse_args()
    output = Path(a.saida)
    temp = output.with_suffix(".tmp")
    temp.write_text(json.dumps(run(a.historico,a.iot,a.corte,a.modo),ensure_ascii=False,indent=2,allow_nan=False),encoding="utf-8")
    temp.replace(output)
