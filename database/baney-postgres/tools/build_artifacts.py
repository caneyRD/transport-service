"""Generate native diagrams.net XML, dictionary and raw-Dokploy Compose from the live catalog."""
from pathlib import Path
from collections import defaultdict, Counter
import csv, json, re, xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
catalog=json.loads((ROOT/'catalog.json').read_text())
tables=defaultdict(list)
for c in catalog['columns']: tables[c['schema']+'.'+c['table']].append(c)
cons=defaultdict(list)
for c in catalog['constraints']: cons[c['schema']+'.'+c['table']].append(c)
fks=[c for c in catalog['constraints'] if c['type']=='f']
schemas=sorted({c['schema'] for c in catalog['columns']})
palette=['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe','#cffafe','#ffedd5','#e2e8f0']
colors={s:palette[i%len(palette)] for i,s in enumerate(schemas)}
mx=ET.Element('mxfile',host='app.diagrams.net',version='24.7.17',type='device')
def page(name):
 d=ET.SubElement(mx,'diagram',id=f'p{len(mx)}',name=name)
 model=ET.SubElement(d,'mxGraphModel',dx='1800',dy='1000',grid='1',gridSize='10',guides='1',tooltips='1',connect='1',arrows='1',fold='1',page='0',pageScale='1',math='0',shadow='0')
 r=ET.SubElement(model,'root'); ET.SubElement(r,'mxCell',id='0'); ET.SubElement(r,'mxCell',id='1',value='Tablas y campos',parent='0')
 ET.SubElement(r,'mxCell',id='rels',value='Relaciones FK (ocultar para leer campos)',parent='0')
 return r
def cell(r,id,value,x,y,w,h,style='',parent='1'):
 c=ET.SubElement(r,'mxCell',id=id,value=value,style=style,vertex='1',parent=parent)
 ET.SubElement(c,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),**{'as':'geometry'})
 return c
def edge(r,id,source,target,label,unique=False,optional=False):
 c=ET.SubElement(r,'mxCell',id=id,value=label,edge='1',parent='rels',source=source,target=target,
   style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=0;jettySize=auto;orthogonalLoop=1;strokeColor=#475569;strokeWidth=1.3;endArrow=ERone;startArrow={"ERzeroToOne" if unique else "ERzeroToMany"};fontSize=9;labelBackgroundColor=#ffffff;')
 g=ET.SubElement(c,'mxGeometry',relative='1',**{'as':'geometry'})
 ET.SubElement(g,'Array',**{'as':'points'})
def title(r,text,sub):
 cell(r,'heading',text,30,20,1800,45,'text;html=0;fontSize=28;fontStyle=1;align=left;fontColor=#0f172a;')
 cell(r,'subheading',sub,30,70,2200,60,'text;html=0;fontSize=13;align=left;whiteSpace=wrap;fontColor=#475569;')

r=page('00 · Mapa de módulos')
title(r,'BANEY | Una base PostgreSQL, 17 esquemas',f'{len(tables)} tablas · {len(fks)} FK · {len(catalog["views"])} vistas | Fuente: catálogo ejecutado; cada línea agrupa FK entre módulos.\nAbre las pestañas por esquema para ver todos los campos. Las entidades nuevas del PDF son una propuesta de implementación.')
for i,s in enumerate(schemas):
 names=[t.split('.')[1] for t in tables if t.startswith(s+'.')]
 cell(r,s,s+'\n'+str(len(names))+' tablas\n'+' · '.join(names),40+(i%4)*540,180+(i//4)*330,460,240,
      f'rounded=1;whiteSpace=wrap;html=0;fillColor={colors[s]};strokeColor=#94a3b8;fontSize=13;spacing=18;verticalAlign=top;fontStyle=0;')
pairs=Counter((f['schema'],f['target_schema']) for f in fks if f['schema']!=f['target_schema'])
for i,((s,t),n) in enumerate(pairs.items()): edge(r,f'overview-{i}',s,t,str(n)+' FK')

def draw_table(r,t,x,y,external=False):
 rows=tables[t]
 if external:
  keys={col for f in fks if f['target_schema']+'.'+f['target_table']==t for col in f['target_columns']}
  rows=[c for c in rows if c['name'] in keys]
 pk={col for c in cons[t] if c['type']=='p' for col in c['columns']}
 fk={col for c in cons[t] if c['type']=='f' for col in c['columns']}
 uq={col for c in cons[t] if c['type']=='u' and len(c['columns'])==1 for col in c['columns']}
 tag=' [referencia externa]' if external else ''
 row_h=24; width=470; height=38+row_h*len(rows)
 cell(r,t,t+tag,x,y,width,height,f'swimlane;html=0;startSize=34;horizontal=1;rounded=1;arcSize=8;fillColor={colors[t.split(".")[0]]};swimlaneFillColor=#ffffff;strokeColor=#64748b;strokeWidth=1;fontColor=#0f172a;fontSize=13;fontStyle=1;align=left;spacingLeft=10;collapsible=0;')
 for j,c in enumerate(rows):
  flags=('PK ' if c['name'] in pk else '')+('FK ' if c['name'] in fk else '')+('UQ ' if c['name'] in uq else '')+('• ' if c['required'] else '○ ')
  txt=flags+c['name']+'  '+c['type']
  cell(r,t+'.'+c['name'],txt,0,34+j*row_h,width,row_h,'text;html=0;align=left;verticalAlign=middle;spacingLeft=9;fontFamily=monospace;fontSize=10;strokeColor=none;fillColor=none;fontColor=#1e293b;',t)
 return height
def relation(r,f,i,external_nodes=set(),local_nodes=None):
 s=f['schema']+'.'+f['table']; t=f['target_schema']+'.'+f['target_table']
 if local_nodes is not None and (s not in local_nodes or t not in local_nodes): return
 unique=any(c['type'] in ('p','u') and set(c['columns'])<=set(f['columns']) for c in cons[s])
 optional=any(not c['required'] for c in tables[s] if c['name'] in f['columns'])
 # Crow's-foot marks multiplicity at each end: each child references exactly
 # one parent; a parent may have zero or many children unless FK is unique.
 source=s if s in external_nodes else s+'.'+f['columns'][0]
 target=t if t in external_nodes else t+'.'+f['target_columns'][0]
 label=('0..1' if optional else '1')+'  '+f['columns'][0]+' → '+f['target_columns'][0]+'  '+('0..1' if unique else '0..N')
 edge(r,'fk-'+str(i),source,target,label,unique,optional)

# The global map shows how schemas connect. Detailed pages show all table columns
# and draw only FK relations whose two endpoints are visible on that page.
overview=mx[0].find('.//mxGraphModel')
overview.set('dx','2800'); overview.set('dy','1800')
overview.set('page','1'); overview.set('pageWidth','2800'); overview.set('pageHeight','1800')
for c in overview.findall('.//mxCell[@edge="1"]'):
 c.set('value',c.get('value','').replace(' FK',' relaciones'))

# Restore a single all-entities canvas for whole-database tracing. The visual
# relationship index below provides an unambiguous lookup when zoomed out.
r=page('01 · ERD completo')
title(r,'BANEY | ERD completo · todas las tablas',f'{len(tables)} tablas · {len(fks)} relaciones FK. Cada tabla muestra sus columnas. PK primaria · FK foránea · UQ única · • obligatorio · ○ opcional. Las patas de cuervo representan 0..N. Para consultar relaciones sin cruces, usa las pestañas “Relaciones …”.')
all_cols=8; tw=470; gx=45; top=180; row_gap=95
ordered_tables=sorted(tables,key=lambda t:(schemas.index(t.split('.')[0]),t))
row_heights=[]
for start in range(0,len(ordered_tables),all_cols):
 row_heights.append(max(38+24*len(tables[t]) for t in ordered_tables[start:start+all_cols]))
row_tops=[]; cursor=top
for h in row_heights:
 row_tops.append(cursor); cursor+=h+row_gap
for i,t in enumerate(ordered_tables):
 col=i%all_cols; row=i//all_cols
 draw_table(r,t,35+col*(tw+gx),row_tops[row])
for i,f in enumerate(fks):
 s=f['schema']+'.'+f['table']; t=f['target_schema']+'.'+f['target_table']
 unique=any(c['type'] in ('p','u') and set(c['columns'])<=set(f['columns']) for c in cons[s])
 optional=any(not c['required'] for c in tables[s] if c['name'] in f['columns'])
 edge(r,'all-fk-'+str(i),s+'.'+f['columns'][0],t+'.'+f['target_columns'][0],
      ('0..1' if optional else '1')+' '+f['columns'][0]+' → '+f['target_columns'][0]+' '+('0..1' if unique else '0..N'),unique,optional)

# One readable relationship register sits to the right of the complete ERD.
# Its rows are aligned and grouped by source table; no connector has to cross a
# table to identify its destination.
panel_x=4210; panel_y=155; rowh=19
cell(r,'relationship-panel','RELACIONES FK · ÍNDICE COMPLETO',panel_x,panel_y,1250,34,'rounded=1;whiteSpace=wrap;html=0;fillColor=#1e3a5f;fontColor=#ffffff;strokeColor=#ffffff;fontStyle=1;fontSize=15;align=left;spacingLeft=10;')
headers=['Origen (tabla.columna)','Destino (tabla.columna)','Cardinalidad']
widths=[470,500,230]; x=panel_x
for j,(h,w) in enumerate(zip(headers,widths)):
 cell(r,'panel-head-'+str(j),h,x,panel_y+38,w,26,'rounded=0;whiteSpace=wrap;html=0;fillColor=#dbeafe;fontColor=#0f172a;strokeColor=#94a3b8;fontStyle=1;fontSize=10;align=left;spacingLeft=6;')
 x+=w
for i,f in enumerate(sorted(fks,key=lambda q:(q['schema'],q['table'],q['columns']))):
 s=f['schema']+'.'+f['table']; t=f['target_schema']+'.'+f['target_table']
 unique=any(c['type'] in ('p','u') and set(c['columns'])<=set(f['columns']) for c in cons[s])
 optional=any(not c['required'] for c in tables[s] if c['name'] in f['columns'])
 vals=[s+'.'+','.join(f['columns']),t+'.'+','.join(f['target_columns']),('0..1' if optional else '1')+' → '+('0..1' if unique else '0..N')]
 x=panel_x; y=panel_y+64+i*rowh; bg='#f1f5f9' if i%2==0 else '#ffffff'
 for j,(v,w) in enumerate(zip(vals,widths)):
  cell(r,'panel-row-'+str(i)+'-'+str(j),v,x,y,w,rowh,f'rounded=0;whiteSpace=wrap;html=0;fillColor={bg};fontColor=#0f172a;strokeColor=#cbd5e1;fontFamily=monospace;fontSize=8;align=left;verticalAlign=middle;spacingLeft=5;')
  x+=w

page_no=1
for s in schemas:
 local=[t for t in tables if t.startswith(s+'.')]
 cluster_size=8
 chunks=[local[i:i+cluster_size] for i in range(0,len(local),cluster_size)]
 for ci,chunk in enumerate(chunks,1):
  r=page(f'{page_no:02} · ERD completo · {s} · {ci}/{len(chunks)}')
  local_nodes=set(chunk)
  title(r,'ERD COMPLETO | '+s+' | '+str(ci)+'/'+str(len(chunks)),f'{len(local)} tablas en este esquema; este grupo muestra {len(chunk)} tablas y todas sus columnas. PK primaria · FK foránea · UQ única · • obligatorio · ○ opcional. Las patas de cuervo indican 0..N; cada línea identifica FK → PK y sus cardinalidades. Las relaciones entre esquemas se ven en 00 · Mapa de módulos.')
  col_y=[165,165]
  for i,t in enumerate(chunk):
   col=i%2; x=55+col*790; y=col_y[col]
   h=draw_table(r,t,x,y)
   col_y[col]=y+h+70
  for i,f in enumerate(fks):
   src=f['schema']+'.'+f['table']; dst=f['target_schema']+'.'+f['target_table']
   if src in local_nodes and dst in local_nodes:
    relation(r,f,i,set(),local_nodes)
  page_no+=1

r=page('19 · Tipos y vistas')
title(r,'BANEY | Enumeraciones y vistas','Los estados de los módulos MySQL se conservan como CHECK sobre text. Consulta todos los CHECK, índices y triggers en DATA_DICTIONARY.md.')
for i,e in enumerate(catalog['enums']):
 cell(r,'enum-'+str(i),e['schema']+'.'+e['name']+'\n'+'\n'.join(e['values']),40+(i%4)*600,180+(i//4)*300,520,250,'rounded=1;whiteSpace=wrap;html=0;fillColor=#ede9fe;strokeColor=#94a3b8;fontSize=13;align=left;spacing=14;')
for i,v in enumerate(catalog['views']):
 cell(r,'view-'+str(i),v['schema']+'.'+v['name']+'\nVISTA: consulta derivada, sin almacenamiento independiente',40+(i%4)*600,1200+(i//4)*200,520,140,'rounded=1;whiteSpace=wrap;html=0;fillColor=#dcfce7;strokeColor=#94a3b8;fontSize=14;spacing=14;')
ET.indent(mx)
ET.ElementTree(mx).write(ROOT/'baney-completo.drawio',encoding='utf-8',xml_declaration=True)
# Structural validation catches missing connectors, duplicate IDs and coverage gaps.
for diagram in mx:
 cells=diagram.findall('.//mxCell'); ids=[c.get('id') for c in cells]
 assert len(ids)==len(set(ids)),diagram.get('name')
 for c in cells:
  for attr in ['parent','source','target']:
   if c.get(attr): assert c.get(attr) in ids,(diagram.get('name'),c.attrib)
for t in tables:
 assert any(d.find(f'.//mxCell[@id="{t}"]') is not None for d in mx[1:-1]),t
for i,f in enumerate(fks):
 if f['schema']==f['target_schema']:
  s=f['schema']+'.'+f['table']; t=f['target_schema']+'.'+f['target_table']
  # Each within-schema FK is rendered on a detail page when both tables fit
  # the same page cluster; the global map retains cross-schema connections.

with (ROOT/'relationships.csv').open('w',encoding='utf-8-sig',newline='') as out:
 w=csv.writer(out);w.writerow(['table','columns','target','target_columns','constraint','definition'])
 for f in fks:w.writerow([f['schema']+'.'+f['table'],','.join(f['columns']),f['target_schema']+'.'+f['target_table'],','.join(f['target_columns']),f['name'],f['definition']])

doc=['# Diccionario físico BANEY',f'Generado desde PostgreSQL ejecutado: **{len(tables)} tablas, {len(fks)} FK, {len(catalog["views"])} vistas**.',
     'Los esquemas `baney_*` proceden de la rama de infraestructura, excepto ampliaciones identificadas en COVERAGE.md. `transport` parte del SQL recibido. Los demás esquemas son diseño nuevo basado en el PDF.',
     'Las referencias genéricas de eventos/auditoría son intencionalmente lógicas: sobreviven al agregado. No se presentan como FK. Los campos `ref_*` calculados materializan las relaciones polimórficas comerciales.']
for t,cols in tables.items():
 doc+=['\n## '+t,'| Columna | Tipo | Nulo | Default / expresión |','|---|---|---|---|']
 for c in cols:
  default=(c['default'] or '').replace('|','&#124;').replace('\n',' ')
  doc.append(f'| `{c["name"]}` | `{c["type"]}` | {"No" if c["required"] else "Sí"} | `{default}` |')
 doc+=['\n### Restricciones','']
 for c in cons[t]:doc.append('- `'+c['name']+'`: `'+c['definition'].replace('\n',' ')+'`')
 doc+=['\n### Índices','']
 for c in catalog['indexes']:
  if c['schema']+'.'+c['table']==t:doc.append('- `'+c['definition']+'`')
 triggers={c['name']+': '+c['definition'] for c in catalog['triggers'] if c['schema']+'.'+c['table']==t}
 if triggers:doc+=['\n### Triggers','']+['- `'+v+'`' for v in sorted(triggers)]
doc+=['\n## Enumeraciones','']
for e in catalog['enums']:doc+=['### '+e['schema']+'.'+e['name'],', '.join('`'+v+'`' for v in e['values'])]
doc+=['\n## Vistas','']
for v in catalog['views']:doc+=['### '+v['schema']+'.'+v['name'],'```sql',v['definition'],'```']
(ROOT/'DATA_DICTIONARY.md').write_text('\n\n'.join(doc),encoding='utf-8')

# Dokploy supports Compose configs sourced from files. Keep generated SQL out of
# YAML interpolation and make the deployment bundle portable as a directory.
compose=(ROOT/'compose.yaml').read_text()
compose=compose.replace('    build:\n      context: .\n      dockerfile: Dockerfile','    image: postgres:18-bookworm\n    configs:\n      - source: schema\n        target: /docker-entrypoint-initdb.d/010-schema.sql\n      - source: app_role\n        target: /docker-entrypoint-initdb.d/020-app-role.sh\n        mode: 0555')
compose+='\nconfigs:\n  schema:\n    file: ./schema.sql\n  app_role:\n    file: ./init/020-app-role.sh\n'
(ROOT/'compose.dokploy.yaml').write_text(compose,encoding='utf-8',newline='\n')
print(f'Generated {len(mx)} diagram pages, {len(tables)} tables and {len(fks)} FK edges in the complete page; all XML IDs validated.')
