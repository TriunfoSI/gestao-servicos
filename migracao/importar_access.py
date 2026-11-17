#!/usr/bin/env python3
"""
Converte o banco Access (SITRIUNFO_v2.0.accdb) para o banco novo.

Uso:  python3 importar_access.py <arquivo.accdb> <saida.sql> <relatorio.md>

Requer o mdbtools instalado (comando mdb-export). Não altera o arquivo Access.
Gera um SQL com todos os dados limpos e um relatório do que precisa ser conferido.
"""
import csv, io, re, subprocess, sys
from collections import Counter, defaultdict
from datetime import date

ACCDB, SAIDA, RELATORIO = sys.argv[1], sys.argv[2], sys.argv[3]
avisos = defaultdict(list)


def tabela(nome):
    out = subprocess.run(["mdb-export", "-T", "%Y-%m-%d", ACCDB, nome],
                         capture_output=True, check=True).stdout.decode("utf-8")
    return list(csv.DictReader(io.StringIO(out)))


def txt(v):
    if v is None:
        return None
    v = v.replace("\xa0", " ").strip()
    return None if v in ("", "-", "--", "S/N") else v


def num(v):
    v = txt(v)
    try:
        return int(float(v)) if v is not None else None
    except ValueError:
        return None


def dt(v):
    v = txt(v)
    return v[:10] if v else None


def uf(v):
    v = (txt(v) or "").upper()
    if v in ("S", "SP."):
        v = "SP"
    return v if len(v) == 2 else None


def reais(v):
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def sql(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


saida = ["-- Dados importados do Access em " + date.today().isoformat(),
         "-- Gerado por migracao/importar_access.py — rode depois dos arquivos 01 a 03.",
         "begin;"]


def inserir(t, linhas, cols):
    if not linhas:
        return
    saida.append(f"\n-- {t}: {len(linhas)} registros")
    for i in range(0, len(linhas), 200):
        bloco = linhas[i:i + 200]
        vals = ",\n".join("(" + ", ".join(sql(l.get(c)) for c in cols) + ")" for l in bloco)
        saida.append(f"insert into {t} ({', '.join(cols)}) overriding system value values\n{vals};")


contagem = {}

# ---------------------------------------------------------------- listas
def lista(origem, t, idc, descc, extra=None):
    linhas = []
    for r in tabela(origem):
        l = {"id": num(r[idc]), "descricao": txt(r[descc])}
        if extra:
            l.update({k: txt(r[v]) for k, v in extra.items()})
        linhas.append(l)
    inserir(t, linhas, list(linhas[0].keys()))
    contagem[t] = len(linhas)
    return {l["id"]: l["descricao"] for l in linhas}

servicos = lista("CAD_SERVICO", "servico", "CAD_SERVICO", "SERV_DESCRICAO", {"area": "SERV_AREA"})
det_os = lista("CAD_OS_SITUACAO", "os_situacao_detalhe", "COD_OS_SIT", "OS_SIT_DESCR")
periodos = lista("CAD_PRAZO_BLOCO", "periodo", "CAD_PRAZO_BLOCO", "PRAZO_BLOCO_TIPO")
tipos_mov = lista("CAD_TIPOMOVIMENTACAO", "mov_tipo", "COD_ANDAMENTO", "MOVIMENTACAO_TIPO")
det_mov = lista("CAD_MOVIMENTACAO_DETALHE", "mov_detalhe", "COD_ANDAMENTO", "MOVIMENTACAO_TIPO")
sit_mov = lista("CAD_SIT_MOV", "mov_situacao", "CAD_SIT_MOV", "SIT_MOV")

# ---------------------------------------------------------------- equipe
equipe = []
for r in tabela("EQUIPE"):
    equipe.append({"id": num(r["CAD_EQUIPE"]), "nome": txt(r["EQUIPE_NOME"]), "iniciais": txt(r["EQUIPE_INICIAIS"]),
                   "cpf": txt(r["EQUIPE_CPF"]), "rg": txt(r["EQUIPE_RG"]), "formacao": txt(r["EQUIPE_FORMACAO"]),
                   "registro_conselho": txt(r["EQUIPE_REGCONSELHO"])})
    if not equipe[-1]["nome"]:
        equipe[-1]["nome"] = equipe[-1]["iniciais"] or f"Pessoa {equipe[-1]['id']}"
inserir("equipe", equipe, ["id", "nome", "iniciais", "cpf", "rg", "formacao", "registro_conselho"])
contagem["equipe"] = len(equipe)
ids_equipe = {e["id"] for e in equipe}
def em(v, ref):
    v = num(v)
    return v if v in ref else None

def resp(v):
    v = num(v)
    return v if v in ids_equipe else None

# ---------------------------------------------------------------- clientes
clientes = []
for r in tabela("CLIENTE"):
    clientes.append({"id": num(r["COD_CLIENTE"]), "nome": txt(r["CLIENTE_NOME"]), "nome_reduzido": txt(r["CLIENTE_NOME_REDUZ"]),
                     "cpf_cnpj": txt(r["CLIENTE_CPF_CNPJ"]), "endereco": txt(r["CLIENTE_ENDERECO"]),
                     "municipio": txt(r["CLIENTE_MUNICIPIO"]), "uf": uf(r["CLIENTE_UF"]),
                     "telefone": txt(r["CLIENTE_TEL"]), "email": txt(r["CLIENTE_EMAIL"])})
inserir("cliente", clientes, list(clientes[0].keys()))
contagem["cliente"] = len(clientes)
for nome, n in Counter(c["nome"].upper() for c in clientes).items():
    if n > 1:
        avisos["Clientes duplicados"].append(f"{nome} aparece {n} vezes")
for doc, n in Counter(c["cpf_cnpj"] for c in clientes if c["cpf_cnpj"]).items():
    if n > 1:
        avisos["Clientes duplicados"].append(f"CPF/CNPJ {doc} aparece em {n} clientes")

# ---------------------------------------------------------------- OS
os_access = tabela("OS")
cliente_do_contato = defaultdict(Counter)
for r in os_access:
    if num(r["CAD_REPRESENTANTE"]):
        cliente_do_contato[num(r["CAD_REPRESENTANTE"])][num(r["COD_CLIENTE"])] += 1

contatos = []
for r in tabela("CLIENTE_REPRESENTANTE"):
    cid = num(r["COD_REPRES"])
    cl = cliente_do_contato[cid].most_common(1)[0][0] if cliente_do_contato[cid] else None
    if len(cliente_do_contato[cid]) > 1:
        avisos["Contatos ligados a mais de um cliente (ficou com o mais frequente)"].append(
            f"{txt(r['REPRES_NOME'])}: clientes {sorted(cliente_do_contato[cid])}")
    contatos.append({"id": cid, "cliente_id": cl, "nome": txt(r["REPRES_NOME"]) or "(sem nome)",
                     "documentos": txt(r["REPRES_DOCUMENTOS"]), "endereco": txt(r["REPRES_ENDERECO"]),
                     "municipio": txt(r["REPRES_MUNICIPIO"]), "uf": uf(r["REPRES_UF"]),
                     "telefone": txt(r["REPRES_TEL_COMERCIAL"]), "whatsapp": txt(r["REPRES_TELWP"]),
                     "email": txt(r["REPRES_EMAIL"])})
inserir("contato", contatos, list(contatos[0].keys()))
contagem["contato"] = len(contatos)
sem_cliente = [c["nome"] for c in contatos if c["cliente_id"] is None]
if sem_cliente:
    avisos["Contatos sem cliente (não aparecem em nenhuma OS)"].append(", ".join(sem_cliente))

MAP_COMERCIAL = {"Finalizada": "Encerrado", "Finalizado": "Encerrado", "Em aberto": "Em aberto",
                 "Paralisada": "Paralisado", "Paralisado": "Paralisado"}

def contrato(tec, com):
    if tec in ("Finalizado", "Cancelado") and com == "Encerrado":
        return "Encerrado"
    if tec == "Paralisado" or com == "Paralisado":
        return "Paralisado"
    return "Ativo"

lista_os = []
for r in os_access:
    tec = txt(r["OS_SIT_TECNICO"]) or "Não iniciado"
    if num(r["OS_SIT_ANDAMENTO"]) == 14:
        tec = "Cancelado"
    com = MAP_COMERCIAL.get(txt(r["OS_SIT_COMERCIAL"]), "Em aberto")
    antigo = txt(r["OS_SIT_CONTRATO"])
    novo = contrato(tec, com)
    revisar = None
    if antigo and antigo != novo:
        revisar = (f"No Access o contrato estava \"{antigo}\"; pela regra nova fica \"{novo}\" "
                   f"(técnico: {tec}, comercial: {com}). Confira as situações técnica e comercial.")
        avisos["OS cuja situação do contrato muda com a regra nova"].append(f"OS {txt(r['OS_NUM'])} (código {r['CAD_OS']}): {revisar}")
    lista_os.append({"id": num(r["CAD_OS"]), "numero": txt(r["OS_NUM"]), "proposta": txt(r["CAD_PROPOSTA"]),
                     "titulo": txt(r["OS_TITULO"]), "cliente_id": num(r["COD_CLIENTE"]),
                     "contato_id": num(r["CAD_REPRESENTANTE"]), "responsavel_id": resp(r["OS_EQUIPE"]),
                     "data_aceite": dt(r["OS_ACEITE"]), "tipo_aceite": txt(r["OS_ACEITE_TIPO"]),
                     "data_termino": dt(r["OS_TERMINO"]), "prazo_contratual": txt(r["OS_PRAZODIAS"]),
                     "local": txt(r["OS_LOCAL"]), "local_endereco": txt(r["OS_LOCALEND"]),
                     "municipio": txt(r["OS_MUNICIPIO"]), "uf": uf(r["OS_UF"]),
                     "codigo_cliente": txt(r["OS_CLIENTE_COD"]), "sit_tecnica": tec,
                     "sit_tecnica_detalhe_id": num(r["OS_SIT_ANDAMENTO"]) if num(r["OS_SIT_ANDAMENTO"]) in det_os else None,
                     "sit_comercial": com, "situacao_atualizada_em": dt(r["SITUACAO_ATUALIZACAO"]),
                     "revisar_migracao": revisar})
inserir("os", lista_os, list(lista_os[0].keys()))
contagem["os"] = len(lista_os)
ids_os = {o["id"] for o in lista_os}
numero_os = {o["id"]: o["numero"] for o in lista_os}

# ---------------------------------------------------------------- escopo
escopo = [{"id": num(r["OSESC_CAD"]), "os_id": num(r["CAD_OS"]), "servico_id": em(r["OSESC_SERVICO"], servicos),
           "descricao": txt(r["OSESC_DESCRICAO"]), "ordem": num(r["OSCESC_SEQ"]) or 0}
          for r in tabela("OS_ESCOPO") if num(r["CAD_OS"]) in ids_os]
inserir("os_escopo", escopo, list(escopo[0].keys()))
contagem["os_escopo"] = len(escopo)

# ---------------------------------------------------------------- prazos
MAP_ORIGEM = {"PLANEJAMENTO": "Planejamento", "MP | OFÍCIO": "MP | Ofício", "MP": "MP", "CETESB": "CETESB",
              "PREFEITURA": "Prefeitura", "CTR3": "CTR-3"}
MAP_TIPO = {"CRONOGRAMA": "Cronograma", "PROTOCOLO": "Protocolo", "PRODUTO TÉCNICO": "Produto técnico",
            "VENCIMENTO": "Vencimento", "VISTORIA TÉCNICA": "Vistoria técnica"}
MAP_SIT_PRAZO = {"NÃO INICIADO": "Não iniciado", "NÃO INICIADA": "Não iniciado", "EM ANDAMENTO": "Em andamento",
                 "CONCLUÍDO": "Concluído", "NÃO ATENDIDO": "Não atendido", "ATENDIDO": "Concluído"}
prazos, sem_os = [], 0
for r in tabela("PRAZOS"):
    if num(r["COD_OS"]) not in ids_os:
        sem_os += 1
        continue
    origem, tipo = txt(r["PRAZO_ORIGEM"]), txt(r["PRAZO_TIPO"])
    qtd = num(r["PRAZO_CONCEDIDO"]) or (num(r["PRAZO_QTD"]) or None)
    prazos.append({"id": num(r["CAD_PRAZO"]), "os_id": num(r["COD_OS"]),
                   "origem": MAP_ORIGEM.get((origem or "").upper(), origem),
                   "tipo": MAP_TIPO.get((tipo or "").upper(), tipo),
                   "referencia": txt(r["PRAZO_REF"]), "descricao": txt(r["PRAZO_DESCRICAO"]) or "(sem descrição)",
                   "data_inicio": dt(r["PRAZO_DATA-RECEB"]), "qtd_dias": qtd,
                   "tipo_dia": "úteis" if txt(r["PRAZO_TIPOdia"]) == "úteis" else None,
                   "data_termino": dt(r["PRAZO_DATA-TERMINO"]),
                   "situacao": MAP_SIT_PRAZO.get((txt(r["PRAZO_SITUACAO"]) or "").upper(), "Não iniciado"),
                   "periodo_id": em(r["PRAZO_N_ME"], periodos), "responsavel_id": resp(r["PRAZO_RESP"])})
inserir("prazo", prazos, list(prazos[0].keys()))
contagem["prazo"] = len(prazos)
if sem_os:
    avisos["Registros não importados"].append(f"{sem_os} prazos sem OS (linhas vazias ou modelos do Access)")
hoje = date.today().isoformat()
vencidos = sum(1 for p in prazos if p["data_termino"] and p["data_termino"] < hoje
               and p["situacao"] in ("Não iniciado", "Em andamento"))
avisos["Prazos a atualizar"].append(
    f"{vencidos} prazos já passaram da data final e continuam como \"Não iniciado\" ou \"Em andamento\". "
    "Eles aparecem como Vencidos no painel de prazos até alguém atualizar a situação.")

# ---------------------------------------------------------------- andamento e tarefas
MAP_SIT_TAREFA = {1: "Concluída", 2: "A fazer", 3: "Em andamento", 4: "A fazer", 5: "A fazer", 7: "A fazer", 9: "Cancelada"}
movs, tarefas = [], []
antigos = 0
for r in tabela("MOVIMENTACAO"):
    os_id = num(r["CAD_OS"]) if num(r["CAD_OS"]) in ids_os else None
    if (dt(r["MOVIMENTACAO_DATAInicio"]) or "9999") < "2026-11-10":   # pedido de 17/11/2026: descartar registros antigos
        antigos += 1
        continue
    if num(r["MOVIMENTACAO_DETALHE"]) in (13, 15):    # TAREFA | EQUIPE TÉCNICA e PENDÊNCIA | PONTO DE ATENÇÃO -> tarefas
        obs = txt(r["MOVIMENTACAO_OBS"])
        if num(r["MOVIMENTACAO_DETALHE"]) == 15:
            obs = "\n".join(x for x in [obs, "Origem: Pendência | Ponto de atenção"] if x)
        sit_antiga = sit_mov.get(num(r["MOVIMENTACAO_SITUAÇÃO"]))
        tarefas.append({"id": num(r["CAD_MOVIMENTACAO"]), "os_id": os_id,
                        "descricao": txt(r["MOVIMENTACAO_DESCRICAO"]) or "(sem descrição)",
                        "responsavel_id": resp(r["MOVIMENTACAO_RESP"]), "data_reuniao": dt(r["MOVIMENTACAO_DATAInicio"]),
                        "situacao": MAP_SIT_TAREFA.get(num(r["MOVIMENTACAO_SITUAÇÃO"]), "A fazer"),
                        "observacao": "\n".join(x for x in [obs, f"Situação no Access: {sit_antiga}" if sit_antiga else None] if x) or None})
        continue
    movs.append({"id": num(r["CAD_MOVIMENTACAO"]), "os_id": os_id,
                 "visibilidade": "Geral" if (txt(r["MOVIMENTACAO_EXPO"]) or "").lower() == "geral" else "Interna",
                 "tipo_id": em(r["MOVIMENTACAO_TIPO"], tipos_mov), "detalhe_id": em(r["MOVIMENTACAO_DETALHE"], det_mov),
                 "data_inicio": dt(r["MOVIMENTACAO_DATAInicio"]) or hoje, "data_termino": dt(r["MOVIMENTACAO_DATATermino"]),
                 "executor": txt(r["MOVIMENTACAO_EXECUTOR"]), "descricao": txt(r["MOVIMENTACAO_DESCRICAO"]) or "(sem descrição)",
                 "observacao": txt(r["MOVIMENTACAO_OBS"]), "situacao_id": em(r["MOVIMENTACAO_SITUAÇÃO"], sit_mov),
                 "responsavel_id": resp(r["MOVIMENTACAO_RESP"])})
inserir("movimentacao", movs, list(movs[0].keys()))
inserir("tarefa", tarefas, list(tarefas[0].keys()))
contagem["movimentacao"], contagem["tarefa"] = len(movs), len(tarefas)
avisos["Andamento"].append(f"{antigos} registros anteriores a 10/11/2026 foram descartados. "
                           f"{len(tarefas)} registros \"TAREFA | EQUIPE TÉCNICA\" e \"PENDÊNCIA | PONTO DE ATENÇÃO\" viraram Tarefas; "
                           f"os outros {len(movs)} ficaram no Andamento. Todos estão como \"Interna\" (não aparecem para o cliente).")
avisos["Registros não importados"].append("1 registro de detalhamento de vistoria com foto (tabela MOVIMENTACA_DESCRICAO); a foto fica no Access/Dropbox")

# ---------------------------------------------------------------- financeiro
MAP_SIT_CF = {1: "Pago", 2: "Em aberto", 3: "Nota fiscal emitida", 4: "Pendência"}
parcelas = []
for r in tabela("CONTROLE_FINANCEIRO"):
    os_id = num(r["CAD_OS"])
    if os_id not in ids_os:
        avisos["Registros não importados"].append(
            f"Parcela {r['CF_PARCELA']} de {reais(float(r['CF_VALOR']))} ligada à OS código {r['CAD_OS'] or '(vazio)'}, que não existe")
        continue
    m = re.match(r"^\s*0*(\d+)\s*/\s*0*(\d+)\s*$", r["CF_PARCELA"] or "")
    sit = MAP_SIT_CF.get(num(r["CF_SITUACAO"]), "Em aberto")
    data = dt(r["CF_DATA_PGTO"])
    revisar = []
    if data and data < "2010-01-01":
        revisar.append(f"data {data} parece erro de digitação")
    if sit == "Pago" and not data:
        revisar.append("marcada como paga, mas sem data de pagamento")
    ref = txt(r["CF_PARC_REF"])
    if not m and txt(r["CF_PARCELA"]):
        ref = f"Parcela {txt(r['CF_PARCELA'])}" + (f" — {ref}" if ref else "")
    p = {"id": num(r["CAD_CF"]), "os_id": os_id,
         "numero": int(m.group(1)) if m else None, "total_parcelas": int(m.group(2)) if m else None,
         "referencia": ref, "valor": float(r["CF_VALOR"] or 0), "situacao": sit,
         "nota_fiscal": txt(r["CF_NF"]),
         "data_pagamento": data if sit == "Pago" else None,
         "data_prevista": data if sit != "Pago" else None,
         "periodo_previsto_id": em(r["CF_PAGAMENTO-PREVISAO"], periodos), "banco": txt(r["CF_BANCO"]),
         "observacao": txt(r["CF_OBSERVACAO"]), "revisar_migracao": "; ".join(revisar) or None}
    if revisar:
        avisos["Parcelas a conferir"].append(f"OS {numero_os[os_id]}, parcela {r['CF_PARCELA']} ({reais(p['valor'])}): {p['revisar_migracao']}")
    parcelas.append(p)
inserir("parcela", parcelas, list(parcelas[0].keys()))
contagem["parcela"] = len(parcelas)

# ---------------------------------------------------------------- processos
processos, acessos = [], []
for r in tabela("PROCESSOS_ACESSOS"):
    if num(r["CAD_OS"]) not in ids_os:
        continue
    pid = num(r["CAD_PROCESS_ACESSO"])
    tipo = txt(r["PROCESSO_ACESSOS_TIPO"])
    processos.append({"id": pid, "os_id": num(r["CAD_OS"]), "instituicao": txt(r["PROCESSO_ACESSOS_INSTITUICAO"]),
                      "referencia": txt(r["PROCESSO_ACESSOS_REFERENCIA"]), "data_abertura": dt(r["PROCESSO_ACESSOS_ABERTURA"]),
                      "objetivo": txt(r["PROCESSO_ACESSOS_OBJETIVO"]),
                      "tipo": tipo if tipo in ("Digital", "Físico") else None,
                      "observacao": txt(r["PROCESSO_ACESSOS_OBS"])})
    a = {"processo_id": pid, "plataforma": txt(r["PROCESSO_ACESSOS_PLATAFORMA"]),
         "login": txt(r["PROCESSO_ACESSOS_LOGIN"]), "senha": txt(r["PROCESSO_ACESSOS_SENHA"])}
    if any(a[k] for k in ("plataforma", "login", "senha")):
        acessos.append(a)
inserir("processo", processos, list(processos[0].keys()))
inserir("processo_acesso", acessos, ["processo_id", "plataforma", "login", "senha"])
contagem["processo"], contagem["processo_acesso"] = len(processos), len(acessos)

# ---------------------------------------------------------------- sequências
saida.append("\n-- ajusta os contadores para os próximos cadastros")
for t in ["servico", "os_situacao_detalhe", "periodo", "mov_tipo", "mov_detalhe", "mov_situacao", "equipe",
          "cliente", "contato", "os", "os_escopo", "prazo", "movimentacao", "tarefa", "parcela", "processo"]:
    saida.append(f"select setval(pg_get_serial_sequence('{t}','id'), coalesce((select max(id) from {t}), 0) + 1, false);")
saida.append("commit;")

with open(SAIDA, "w", encoding="utf-8") as f:
    f.write("\n".join(saida) + "\n")

# ---------------------------------------------------------------- relatório
rel = ["# Relatório da importação do Access", "", f"Gerado em {date.today().strftime('%d/%m/%Y')}.", "",
       "## Registros importados", "", "| Tabela nova | Registros |", "|---|---|"]
rel += [f"| {t} | {n} |" for t, n in contagem.items()]
for titulo, itens in avisos.items():
    rel += ["", f"## {titulo}", ""] + [f"- {i}" for i in itens]
with open(RELATORIO, "w", encoding="utf-8") as f:
    f.write("\n".join(rel) + "\n")
print("ok", contagem)
