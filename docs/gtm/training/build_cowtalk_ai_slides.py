# -*- coding: utf-8 -*-
"""CowTalk AI 교육 슬라이드를 smaXtec 교육자료 패키지에 그대로 이어 붙인다.

원본 디자인 토큰을 그대로 쓴다 — 새 테마·새 레이아웃을 만들지 않고
기존 slideLayout1 을 재사용하므로 폰트·마스터가 원본과 동일하다.
"""
import os, re, shutil, zipfile, html

UN = 'un'
EMU = 914400
def E(v): return str(int(round(v * EMU)))
def esc(s): return html.escape(s, quote=False)

# ── 디자인 토큰 (원본에서 추출) ──────────────────────────
BG_LIGHT, BG_DARK = 'F5F3EA', '0A1B17'
INK, MUTED = '10251F', '66746F'
TEAL, GREEN = '15A98C', '65D44A'
CORAL, BLUE, AMBER = 'E96155', '4C8DD9', 'F6B846'
WHITE, PANEL = 'FFFFFF', '1BAF91'
DK_SUB, DK_FOOT = 'C9D8D2', 'BFD1CA'
CALLOUT_BG = 'DFF4E8'

ML, CW = 0.75, 11.83
FOOTER = 'smaXtec × CowTalk | Universal training material'

_uid = [1000]
def nid():
    _uid[0] += 1
    return _uid[0]

def sp(x, y, w, h, geom='rect', fill=None, runs=None, align='l', anchor='t'):
    """단일 도형. runs=[{'t':..,'sz':pt,'c':hex,'b':bool}] (줄바꿈은 별도 문단)"""
    i = nid()
    f = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    body = '<a:p><a:endParaRPr lang="en-US"/></a:p>'
    if runs:
        paras = []
        for para in runs:
            rs = ''
            for r in para:
                sz = int(r.get('sz', 16.5) * 100)
                col = r.get('c', INK)
                b = ' b="1"' if r.get('b') else ''
                it = ' i="1"' if r.get('i') else ''
                rs += (f'<a:r><a:rPr lang="en-US" sz="{sz}"{b}{it}>'
                       f'<a:solidFill><a:srgbClr val="{col}"/></a:solidFill></a:rPr>'
                       f'<a:t>{esc(r["t"])}</a:t></a:r>')
            first = para[0]
            sz = int(first.get('sz', 16.5) * 100)
            paras.append(f'<a:p><a:pPr algn="{align}"><a:buNone/><a:defRPr sz="{sz}"/></a:pPr>{rs}</a:p>')
        body = ''.join(paras)
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="s{i}"/>'
            f'<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr>'
            f'<p:spPr><a:xfrm><a:off x="{E(x)}" y="{E(y)}"/><a:ext cx="{E(w)}" cy="{E(h)}"/></a:xfrm>'
            f'<a:prstGeom prst="{geom}"><a:avLst/></a:prstGeom>{f}'
            f'<a:ln w="0"><a:noFill/><a:prstDash val="solid"/></a:ln></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="{anchor}"/>'
            f'<a:lstStyle/>{body}</p:txBody></p:sp>')

def text(x, y, w, h, t, sz=16.5, c=INK, b=False, align='l', i=False):
    lines = t.split('\n')
    return sp(x, y, w, h, runs=[[{'t': ln, 'sz': sz, 'c': c, 'b': b, 'i': i}] for ln in lines], align=align)

# ── 반복 요소 ────────────────────────────────────────────
def chrome(page, dark=False):
    o = []
    o.append(text(ML, 7.09, 7.29, 0.19, FOOTER, 8.25, DK_FOOT if dark else MUTED))
    o.append(text(12.29, 7.09, 0.29, 0.19, f'{page:02d}', 8.25, WHITE if dark else INK, b=True, align='r'))
    return o

def eyebrow_title(eyebrow, title):
    return [text(ML, 0.44, 5.42, 0.25, eyebrow.upper(), 10.5, TEAL, b=True),
            text(ML, 0.81, CW, 1.00, title, 30, INK, b=True)]

def callout(t):
    return [sp(ML, 5.31, CW, 0.77, geom='roundRect', fill=CALLOUT_BG),
            text(1.06, 5.54, CW - 0.62, 0.33, t, 16.5, INK, b=True)]

def bullets(items, x=0.79, tx=1.08, w=11.50, y0=2.06, pitch=0.73, sz=16.5, h=0.69):
    o = []
    for k, it in enumerate(items):
        yy = y0 + k * pitch
        o.append(sp(x, yy + 0.08, 0.125, 0.125, geom='ellipse', fill=GREEN))
        o.append(text(tx, yy, w, h, it, sz, INK))
    return o

def card(x, y, w, h, accent, label, title, body, body_sz=12.75):
    o = [sp(x, y, w, h, geom='roundRect', fill=WHITE),
         sp(x, y, w, 0.12, fill=accent),
         text(x + 0.29, y + 0.38, w - 0.58, 0.30, label.upper(), 12.75, accent, b=True),
         text(x + 0.29, y + 0.84, w - 0.58, 0.70, title, 16.5, INK, b=True)]
    if body:
        o.append(text(x + 0.29, y + 1.68, w - 0.58, h - 1.95, body, body_sz, MUTED))
    return o

def row_x(n, gap=0.34):
    w = (CW - gap * (n - 1)) / n
    return w, [ML + k * (w + gap) for k in range(n)]

def stat(x, y, w, value, label, color=CORAL):
    return [text(x, y, w, 0.67, value, 36, color, b=True),
            text(x, y + 0.65, w, 0.75, label, 12.75, MUTED)]

def steps(items, y=2.20, h=2.60, gap=0.22, sz=13.5, colors=None):
    n = len(items)
    w = (CW - gap * (n - 1)) / n
    o = []
    for k, (num, head, desc) in enumerate(items):
        x = ML + k * (w + gap)
        cc = (colors[k] if colors else None) or TEAL
        o += [sp(x, y, w, h, geom='roundRect', fill=WHITE),
              sp(x + 0.26, y + 0.28, 0.42, 0.42, geom='ellipse', fill=cc),
              text(x + 0.26, y + 0.34, 0.42, 0.30, num, 13.5, WHITE, b=True, align='ctr'),
              text(x + 0.26, y + 0.92, w - 0.52, 0.62, head, 15, INK, b=True),
              text(x + 0.26, y + 1.66, w - 0.52, h - 1.92, desc, sz, MUTED)]
    return o

def layer_rows(rows, y0=1.96, h=0.70, gap=0.09):
    o = []
    for k, (tag, name, desc, col) in enumerate(rows):
        yy = y0 + k * (h + gap)
        o += [sp(ML, yy, CW, h, geom='roundRect', fill=WHITE),
              sp(ML, yy, 0.12, h, fill=col),
              text(ML + 0.34, yy + 0.12, 1.55, 0.26, tag, 11.25, col, b=True),
              text(ML + 2.00, yy + 0.09, 3.55, 0.32, name, 15.75, INK, b=True),
              text(ML + 5.75, yy + 0.11, CW - 6.05, 0.50, desc, 13.5, MUTED)]
    return o

def two_col(left, right, y=2.06, h=3.05):
    w, xs = row_x(2, gap=0.43)
    n = max(len(left[3]), len(right[3]))
    pitch, ih = (0.58, 0.54) if n <= 3 else (0.44, 0.40)
    o = []
    for (x, (accent, label, title, items)) in zip(xs, (left, right)):
        o += [sp(x, y, w, h, geom='roundRect', fill=WHITE),
              sp(x, y, w, 0.12, fill=accent),
              text(x + 0.30, y + 0.36, w - 0.60, 0.28, label.upper(), 12.75, accent, b=True),
              text(x + 0.30, y + 0.76, w - 0.60, 0.44, title, 17.25, INK, b=True)]
        for k, it in enumerate(items):
            yy = y + 1.30 + k * pitch
            o.append(sp(x + 0.32, yy + 0.06, 0.11, 0.11, geom='ellipse', fill=accent))
            o.append(text(x + 0.58, yy, w - 0.92, ih, it, 13.5, MUTED))
    return o

def divider(num, title, sub, page):
    o = [text(ML, 0.77, 2.29, 1.35, f'{num:02d}', 69, GREEN, b=True),
         text(ML, 2.66, 9.27, 1.04, title, 40.5, WHITE, b=True),
         text(ML, 3.96, 8.12, 1.10, sub, 17.25, DK_SUB),
         sp(10.83, 0.0, 2.50, 7.50, fill=PANEL)]
    dots = [(11.35, 5.89, 0.19, WHITE), (11.62, 5.57, 0.27, GREEN), (11.90, 5.26, 0.35, WHITE),
            (12.17, 4.95, 0.44, GREEN), (12.44, 4.64, 0.52, WHITE)]
    for (x, y, d, c) in dots:
        o.append(sp(x, y, d, d, geom='ellipse', fill=c))
    o += chrome(page, dark=True)
    return o, True

def content(eyebrow, title, blocks, page):
    return eyebrow_title(eyebrow, title) + blocks + chrome(page), False

# ── 슬라이드 정의 ────────────────────────────────────────
SLIDES = []
def add(builder, notes):
    SLIDES.append((builder, notes))

P = 36  # 이어붙이는 첫 페이지 번호
def nxt():
    global P
    p = P; P += 1
    return p

# 36 bridge
add(content('From sensor to system', 'The alert is where smaXtec ends and CowTalk begins', two_col(
    (TEAL, 'What the sensor gives you', 'A reliable event',
     ['A physiological deviation, detected inside the cow',
      'Time-stamped and validated by the manufacturer',
      'The same quality on every farm, every day']),
    (CORAL, 'What still has to happen', 'A decision, by a person',
     ['Which cow do I check first, out of eleven alerts?',
      'What is her history — treatments, parity, days in milk?',
      'Who acts, and with what? Was it actually done?'])) +
    callout('The gap between an alert and an action is where most of the value is lost.'), nxt()),
    'This slide is the hinge of the whole programme. The first half of this training covered the sensor. '
    'Everything that follows covers the layer that turns a sensor event into a decision, an action and a record. '
    'Do not present CowTalk as a better sensor — it is a different layer.')

# 37 divider 07
add(divider(7, 'The layer above the sensor',
    'CowTalk adds context, interpretation and role-based action on top of the sensor event. '
    'It does not re-judge the event itself.', nxt()),
    'Say the boundary out loud: the manufacturer validated the event, so we trust it. '
    'Re-scoring a validated event would only reduce accuracy. Our job starts after the event.')

# 38 four layers
add(content('Architecture', 'Four layers turn a signal into a decision', layer_rows([
    ('LAYER 4', 'Learning loop', 'Expert labels, alarm statistics and treatment outcomes improve the next judgement', AMBER),
    ('LAYER 3', 'Role-based serving', 'The same data reaches farmer, veterinarian, biosecurity officer and administration differently', BLUE),
    ('LAYER 2', 'Interpretation', 'Context is added to the event; every judgement carries its reasoning and its sources', TEAL),
    ('LAYER 1', 'Data integration', 'Sensor events, national records, farm history and weather are joined onto one animal', GREEN),
]) + callout('The sensor event is trusted, not re-judged. CowTalk adds what the sensor cannot know.'), nxt()),
    'Read the stack from the bottom up. Layer 1 is the only place data enters. '
    'Layer 2 never bypasses it — the assistant cannot answer from memory alone, it has to query the data. '
    'That constraint is what makes the answers auditable.')

# 39 identifiers
w4, x4 = row_x(4)
add(content('Context', 'One cow carries four numbers that used to live apart',
    card(x4[0], 2.08, w4, 3.05, CORAL, 'National ID', 'Traceability number',
         'Issued by the state within two weeks of birth. The key that unlocks national records.') +
    card(x4[1], 2.08, w4, 3.05, TEAL, 'Farm tag', 'Management number',
         'What the farm actually calls her. The number used in every conversation on the yard.') +
    card(x4[2], 2.08, w4, 3.05, BLUE, 'Pedigree ID', 'Breeding registry',
         'Ancestry and genetic merit. Needed for inbreeding checks and semen selection.') +
    card(x4[3], 2.08, w4, 3.05, AMBER, 'Device serial', 'Sensor identity',
         'The bolus inside her. Links the physiological stream to everything above.') +
    callout('Joining these four is what turns “this cow has a fever” into a priority and a cost.'), nxt()),
    'In most countries these four numbers live in four systems that never meet. '
    'Ask the room how long it takes today to look up a treatment history for one animal. '
    'That answer is the value of this slide.')

# 40 boundaries
add(content('Boundaries', 'What the assistant does and does not do', two_col(
    (TEAL, 'It does', 'Organise and evidence',
     ['Gather the animal’s full context in one place',
      'Rank candidate explanations with the evidence for each',
      'Propose the next check and the expected timing',
      'Write the record once the person has acted']),
    (CORAL, 'It does not', 'Decide or prescribe',
     ['It does not diagnose — it presents candidates',
      'It does not prescribe — that stays with the veterinarian',
      'It does not act without approval — no silent execution',
      'It does not answer without data — “no data” is a valid answer'])) +
    callout('Every output records its sources. An answer without evidence is treated as a failure, not a result.'), nxt()),
    'Give this slide time. In every audience there is someone who has decided in advance that AI is a liability. '
    'The right-hand column is for that person. Say plainly: the final judgement belongs to a human, '
    'and the system is built so that this cannot be bypassed.')

# 41 divider 08
add(divider(8, 'The assistant',
    'Ask in plain language. The system answers from your own farm data — and shows where every number came from.', nxt()),
    'Demonstrate live if the network allows. If not, use the screenshots in the appendix. '
    'The point to land is that it answers from the farm’s own data, not from general knowledge.')

# 42 tools
w5, x5 = row_x(5, gap=0.22)
add(content('Tools', 'The assistant works only through a fixed set of permitted tools',
    [c for (x, acc, lab, ttl, bod) in [
        (x5[0], TEAL, 'Sensor', 'Animal & signal', 'Profile, event history, temperature and activity series, weather and heat index'),
        (x5[1], GREEN, 'Farm', 'Herd & records', 'Herd summary, key indicators, treatment and milk yield entry'),
        (x5[2], BLUE, 'Reproduction', 'Breeding cycle', 'Breeding statistics, insemination window, semen advice, sync protocols'),
        (x5[3], AMBER, 'Public data', 'National records', 'Traceability, carcass grading, auction prices, regional disease status'),
        (x5[4], CORAL, 'Veterinary', 'Clinical support', 'Differential candidates, treatment outcome confirmation, expert labelling'),
    ] for c in card(x, 2.08, w5, 3.05, acc, lab, ttl, bod, body_sz=11.5)] +
    callout('Every tool call is written to an audit log — who asked, when, and what was returned.'), nxt()),
    'The assistant cannot invent a capability. If a question needs a tool that does not exist, it says so. '
    'Access differs by role — a farmer and a biosecurity officer do not have the same tool set. '
    'Mention that the log is per-call, not per-session; that level of detail is what auditors ask for.')

# 43 evidence
add(content('Evidence', 'Every answer shows where the number came from', steps([
    ('1', 'A question in plain language', '“How is 423 doing?” — typed or spoken, in the user’s own language'),
    ('2', 'Permitted tools are called', 'Only tools this role may use, only for animals in this scope'),
    ('3', 'Data is read from the record', 'Live values from the database — never a recollection or an estimate'),
    ('4', 'The answer carries citations', 'Each figure is tied to its source, its timestamp and its confidence'),
], y=2.14, h=2.72) + callout('If the data is missing, the correct answer is “no data” — not a plausible guess.'), nxt()),
    'Step 4 is the one that matters for professional users. A veterinarian will not act on a number '
    'whose origin is unclear. Point out that when a value is estimated rather than measured, the answer says so.')

# 44 roles
add(content('Roles', 'One dataset, four different questions',
    card(x4[0], 2.08, w4, 3.05, GREEN, 'Farmer', 'What do I do today?',
         'Today’s tasks, heat and calving alerts, the margin each cow returns.') +
    card(x4[1], 2.08, w4, 3.05, CORAL, 'Veterinarian', 'Who do I visit first?',
         'Case queue across all client farms, differential evidence, route and records.') +
    card(x4[2], 2.08, w4, 3.05, BLUE, 'Biosecurity officer', 'Is anything spreading?',
         'Cluster detection, contact tracing, spread scenarios, investigation records.') +
    card(x4[3], 2.08, w4, 3.05, AMBER, 'Administration', 'What is the regional picture?',
         'Coverage, performance indicators, policy briefing and budget evidence.') +
    callout('Permission is enforced on the server. Data outside your scope is not hidden — it is refused.'), nxt()),
    'The distinction between hiding and refusing matters in procurement reviews. '
    'Hiding is a user-interface choice; refusing is an architectural guarantee. '
    'The same rule applies to the assistant’s long-term memory — it only recalls within the account’s permissions.')

# 45 divider 09
add(divider(9, 'Veterinary intelligence',
    'The system organises candidates and the evidence behind them. Diagnosis and prescription remain with the veterinarian.', nxt()),
    'If veterinarians are in the room, this is the section that decides whether they trust the product. '
    'Lead with the limits, then show the evidence table. Never say “the AI diagnoses”.')

# 46 differential
add(content('Differential', 'A probability is useless without the evidence behind it',
    stat(ML, 2.06, 3.33, '6', 'Candidate conditions ranked for each case, with the evidence listed for every one') +
    bullets([
        'Each candidate shows which findings support it and which argue against it',
        'Where data is absent, the item is marked absent — not counted as negative',
        'A weakly evidenced single candidate is not allowed to reach high confidence',
        'The next confirmatory check is proposed, with an urgency level',
    ], x=4.48, tx=4.77, w=7.81, y0=2.04) +
    callout('Uncertainty is displayed, not hidden. A confident-looking number with thin evidence is a defect.'), nxt()),
    'Explain the correction we made: an early version let a single weakly supported candidate reach near-certainty. '
    'That artefact was removed by adding an uncertainty prior. Being open about a fixed defect '
    'earns more clinical trust than any accuracy claim.')

# 47 record
w3, x3 = row_x(3, gap=0.43)
add(content('Record', 'The record writes itself — including the withdrawal date',
    card(x3[0], 2.08, w3, 2.95, TEAL, 'Prescription', 'Written at the chairside',
         'Diagnosis, drug, dose, route and duration captured once, on the spot, and issued as a document.') +
    card(x3[1], 2.08, w3, 2.95, CORAL, 'Withdrawal', 'Calculated automatically',
         'The end date is derived from the product and shown against milk and slaughter — no mental arithmetic.') +
    card(x3[2], 2.08, w3, 2.95, BLUE, 'Outcome', 'Verified by the sensor',
         'Days later the system re-reads the animal and reports recovery, relapse or continued monitoring.') +
    callout('Withdrawal control is food safety — and food safety is a trade issue before it is a farm issue.'), nxt()),
    'For a government audience, the withdrawal card is the strongest slide in the veterinary section. '
    'Residue control is usually managed on paper and memory. Here it becomes a system property, '
    'and it produces the evidence an export market asks for.')

# 48 expert loop
add(content('Learning', 'The veterinarian’s judgement becomes the system’s memory', steps([
    ('1', 'A judgement is spoken', 'During the case review — “this looks like ketosis”'),
    ('2', 'One confirmation', 'The assistant asks once whether to record it as a label'),
    ('3', 'Stored and aggregated', 'Kept as ground truth and tracked per alert type over time'),
    ('4', 'The next judgement improves', 'Guidance is rebuilt by fixed rules — never by the model itself'),
], y=2.14, h=2.72, sz=13) +
    callout('Only expert judgements become labels. Farmer and administrator guesses are excluded to protect data quality.'), nxt()),
    'Step 5 is deliberately conservative: the model does not edit its own instructions. '
    'Guidance is generated by deterministic rules from the label statistics, so every change is reviewable. '
    'This is the answer to “how do you stop the AI drifting?”')

# 49 divider 10
add(divider(10, 'The reproduction loop',
    'From heat alert to insemination decision to pregnancy result — and back into the next recommendation.', nxt()),
    'This is where the farm sees money fastest. Open days are the most expensive number on a dairy, '
    'and they are the number a sensor plus a decision layer moves first.')

# 50 heat
add(content('Heat', 'The recommendation carries the farm’s own settings', bullets([
    'The insemination window is calculated from this farm’s parameters, not a global default',
    'Semen is proposed on inbreeding coefficient, genetic merit and the farm’s stated breeding goal',
    'A pre-check runs first — recent treatment, withdrawal status, repeated failed services',
    'The recommendation names who acts and by when, and the technician receives it directly',
], y0=2.12) + callout('Ranking uses inbreeding, genetic merit and farm goals. Supplier weighting does not exist in the algorithm.'), nxt()),
    'Every farm keeps different breeding settings — return interval, pregnancy check timing, gestation length, '
    'dry-off lead time. Using a global default here is the single most common way an advisory tool loses credibility. '
    'The callout is a procurement answer: read it verbatim if anyone asks about supplier bias.')

# 51 sync + feedback
add(content('Protocol & feedback', 'Protocols become schedules, and results become learning', two_col(
    (BLUE, 'Synchronisation', 'A protocol becomes a calendar',
     ['Four standard protocols are supported as prescriptions',
      'Each becomes dated hormone and insemination tasks',
      'Today’s due treatments appear on the daily worklist',
      'Approval rules still apply before anything is scheduled']),
    (GREEN, 'The closing loop', 'Results teach the next cycle',
     ['Insemination is recorded with sire and technician',
      'The pregnancy result returns as ground truth',
      'Conception rates are tracked by sire and by cow',
      'The next recommendation is adjusted accordingly'])) +
    callout('A conception result that never comes back is a loop that never closes — and a system that never improves.'), nxt()),
    'The failure mode to warn about: farms that record inseminations but not pregnancy results. '
    'Without the result the model cannot learn, and the recommendation quality plateaus. '
    'Make recording the result part of the routine from week one.')

# 52 divider 11
add(divider(11, 'From one farm to a national picture',
    'The same signal that helps one farm, aggregated across many, becomes an early-warning layer for disease control.', nxt()),
    'Shift the frame here. Until now every slide was about one farm. From here the audience should be '
    'thinking about a region and a country.')

# 53 drilldown
add(content('Drill-down', 'Four levels, one continuous view', steps([
    ('1', 'National', 'Risk grade and fever rate by province, on one map'),
    ('2', 'Province', 'Farms in the province with coordinates, herd size and alert counts'),
    ('3', 'Farm', 'Herd status, recent alerts, movement history and contacts'),
    ('4', 'Animal', 'The temperature curve and the interpretation behind the alert'),
], y=2.20, h=2.60) + callout('Four clicks from a national map to the temperature curve of a single cow — without changing systems.'), nxt()),
    'Demonstrate this as one continuous motion rather than four screens. '
    'The impression to leave is that the national number and the individual animal are the same data, '
    'not two reports that have to be reconciled.')

# 54 spread
add(content('Spread', 'Contact tracing and a spread model — not an illustration', two_col(
    (CORAL, 'Contact network', 'Built from movement records',
     ['Animal movements are traced from recorded transfers',
      'Where movement data is absent, proximity is used and flagged as such',
      'Radius analysis lists the farms and head count inside a given distance']),
    (BLUE, 'Spread simulation', 'A differential-equation model',
     ['An SEIR model with disease-specific parameters',
      'Movement-restriction scenarios are compared numerically',
      'Outputs a curve and a farm count, not a qualitative impression'])) +
    callout('The model informs a decision. It does not make one, and it does not predict a specific outbreak.'), nxt()),
    'Be precise about what a model is. It uses published epidemiological parameters for the disease in question; '
    'it is not a forecast of whether an outbreak will occur. Overselling this is how credibility is lost '
    'with veterinary authorities.')

# 55 notification gap
add(content('Reporting', 'The gap before notification is where this layer sits', steps([
    ('—', 'Biological deviation', 'Detectable inside the animal. Empty in today’s systems'),
    ('—', 'Clinical signs', 'Visible to the farmer. Still empty in today’s systems'),
    ('1', 'Notification', 'Where the national system begins today'),
    ('2', 'Confirmation', 'Sampling and laboratory confirmation'),
    ('3', 'Response', 'Movement control and disease management'),
], y=2.20, h=2.60, sz=12.5, colors=[MUTED, MUTED, TEAL, TEAL, TEAL]) +
    callout('This does not replace the national system. It fills the two boxes in front of it and hands over.'), nxt()),
    'Say the replacement sentence early and clearly. Any suggestion of competing with the official notification '
    'system will end the conversation with a veterinary authority. We are an input to it.')

# 56 divider 12
add(divider(12, 'Learning, and staying accountable',
    'Four loops improve the system over time. All four are auditable, and none of them lets the model rewrite its own rules.', nxt()),
    'The two halves of this title are equally important. A system that learns but cannot be audited '
    'is not deployable in a regulated sector.')

# 57 loops
add(content('Loops', 'Four loops, all of them auditable',
    card(x4[0], 2.08, w4, 3.05, CORAL, 'Expert labels', 'Clinical ground truth',
         'Veterinary judgements become labelled cases. Non-expert guesses are excluded by design.') +
    card(x4[1], 2.08, w4, 3.05, TEAL, 'Alert statistics', 'Self-correcting guidance',
         'Confirmation and false-positive rates are turned into written guidance by fixed rules.') +
    card(x4[2], 2.08, w4, 3.05, BLUE, 'Treatment outcome', 'Did it actually work?',
         'The sensor re-reads the animal after treatment and reports recovery or relapse.') +
    card(x4[3], 2.08, w4, 3.05, AMBER, 'Conversation memory', 'Standing farm facts',
         'Durable facts a user states — equipment, protocols, constraints — held within permission limits.') +
    callout('Statistics built on fewer than ten labels never change behaviour. A small sample is not evidence.'), nxt()),
    'The ten-label floor is worth naming explicitly. It is the difference between a system that learns '
    'and a system that overreacts to noise. Auditors and researchers both ask about this threshold.')

# 58 governance
add(content('Governance', 'Data sovereignty is proven by structure, not by promise', bullets([
    'Every value passes through the database — the model cannot bypass the pipeline and answer on its own',
    'Every tool call is logged — who asked, when, on which animal, and what was returned',
    'Requests outside a user’s scope are refused at the gateway, not filtered in the interface',
    'Even the assistant’s long-term memory is recalled only within the account’s permission boundary',
], y0=2.06, pitch=0.64) +
    [sp(ML, 4.76, CW, 0.36, geom='roundRect', fill=WHITE),
     text(1.06, 4.84, CW - 0.62, 0.24,
          'Export boundary — raw sensor data, animal identifiers and clinical records never leave the national instance.',
          12.75, MUTED)] +
    callout('Code crosses borders. Data does not.'), nxt()),
    'For international audiences this is the slide that decides the deal. Raise sovereignty before they do — '
    'answered on request it reads as defence, offered first it reads as design. '
    'Each country runs its own instance; only approved anonymised aggregates ever cross the boundary.')

# 59 divider 13
add(divider(13, 'Putting it to work',
    'A system only pays for itself when it changes what actually happens at half past seven in the morning.', nxt()),
    'The last section is about habit, not technology. Most failed deployments had working software '
    'and no routine.')

# 60 rhythm
add(content('Rhythm', 'The same three questions, every morning', steps([
    ('1', 'Read the overnight list', 'What changed while nobody was watching — sorted by urgency, not by time'),
    ('2', 'Open the decision card', 'Everything about that animal in one place: history, context, recommendation'),
    ('3', 'Record what was done', 'Done, or not done and why. One second — and it is the step that closes the loop'),
], y=2.20, h=2.60, sz=14) +
    callout('If the action is never recorded, the loop never closes and the system never gets better.'), nxt()),
    'Teach only these three actions to farm users. Every additional feature taught in week one reduces adoption. '
    'Step three is the one people skip, and it is the one that determines whether the product improves.')

# 61 measure
add(content('Measurement', 'Measure the process, not only the outcome', bullets([
    'Action-record rate — the share of alerts that ended in a recorded decision',
    'Detection lead time — how many days earlier the check happened than it would have',
    'Open days and conception rate — the reproductive result the farm actually feels',
    'Treatment success and relapse — did the intervention hold, verified by the sensor',
    'Margin per cow per day — where the whole exercise finally lands',
], y0=2.06, pitch=0.62, h=0.58) +
    callout('Action-record rate is the single indicator that predicts whether all the others will move.'), nxt()),
    'Agree these indicators before the pilot starts, not at the end. A pilot without an agreed baseline '
    'cannot prove anything at day ninety, however well it went.')

# 62 30 days
add(content('Implementation', 'Thirty days to turn a system into a habit', steps([
    ('W1', 'Install and connect', 'Sensors in, gateway live, accounts and permissions set for every role'),
    ('W2', 'Measure the baseline', 'Record where the farm stands today — the step most teams skip'),
    ('W3', 'Run the three touches', 'Daily rhythm with support on hand; only the three core actions'),
    ('W4', 'Review and adjust', 'Read the indicators together, tune alert settings, agree the routine'),
], y=2.20, h=2.60) +
    callout('Week 2 is the one people skip. Without a baseline there is nothing to prove at day ninety.'), nxt()),
    'Push back hard on skipping week two. Every farm wants to start using the alerts immediately. '
    'A week of baseline measurement is what makes the day-90 review a result rather than an opinion.')

# 63 takeaways (dark)
def takeaways(page):
    o = [text(ML, 0.60, 5.42, 0.25, 'KEY TAKEAWAYS', 10.5, GREEN, b=True),
         text(ML, 1.00, 11.00, 0.95, 'Three sentences to carry out of this room', 34.5, WHITE, b=True)]
    items = [
        ('1', 'The sensor tells you something changed. This layer tells you what to do about it.'),
        ('2', 'An alert is not a diagnosis, and an AI answer is not a decision. Both are inputs to a person.'),
        ('3', 'The loop only closes when the action is recorded — and nothing improves until it does.'),
    ]
    for k, (n, t) in enumerate(items):
        y = 2.55 + k * 1.16
        o += [sp(ML, y, 0.62, 0.62, geom='ellipse', fill=GREEN),
              text(ML, y + 0.14, 0.62, 0.34, n, 18.75, BG_DARK, b=True, align='ctr'),
              text(1.62, y + 0.06, 10.20, 0.90, t, 20.25, WHITE)]
    o += [sp(10.83, 0.0, 2.50, 7.50, fill=PANEL)] if False else []
    o += chrome(page, dark=True)
    return o, True
add(takeaways(nxt()),
    'Close on the third sentence and stop talking. Do not add a summary of the summary. '
    'If there is time, ask the room which of the three is hardest on their farm — the answer is always the third.')

# ── 패키지에 기록 ────────────────────────────────────────
HEAD = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>'
        '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>')
TAIL = ('</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')

NOTES = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
         '<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
         'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree>'
         '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
         '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
         '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
         '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/>'
         '<p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>'
         '<p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp>'
         '<p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/>'
         '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
         '<p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/>'
         '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>{n}</a:t></a:r></a:p>'
         '</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>')

base = 35
pres = open(f'{UN}/ppt/presentation.xml', encoding='utf-8').read()
prels = open(f'{UN}/ppt/_rels/presentation.xml.rels', encoding='utf-8').read()
ct = open(f'{UN}/[Content_Types].xml', encoding='utf-8').read()

sld_add, rel_add, ct_add = [], [], []
rid = 42
sid = 291
for k, ((shapes, dark), notes) in enumerate(SLIDES, 1):
    n = base + k
    xml = HEAD.format(bg=BG_DARK if dark else BG_LIGHT) + ''.join(shapes) + TAIL
    open(f'{UN}/ppt/slides/slide{n}.xml', 'w', encoding='utf-8').write(xml)
    open(f'{UN}/ppt/slides/_rels/slide{n}.xml.rels', 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide{n}.xml"/>'
        '</Relationships>')
    open(f'{UN}/ppt/notesSlides/notesSlide{n}.xml', 'w', encoding='utf-8').write(NOTES.format(n=esc(notes)))
    open(f'{UN}/ppt/notesSlides/_rels/notesSlide{n}.xml.rels', 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>'
        f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide{n}.xml"/>'
        '</Relationships>')
    sld_add.append(f'<p:sldId id="{sid}" r:id="rId{rid}"/>')
    rel_add.append(f'<Relationship Id="rId{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{n}.xml"/>')
    ct_add.append(f'<Override PartName="/ppt/slides/slide{n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>')
    ct_add.append(f'<Override PartName="/ppt/notesSlides/notesSlide{n}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>')
    rid += 1; sid += 1

pres = pres.replace('</p:sldIdLst>', ''.join(sld_add) + '</p:sldIdLst>')
open(f'{UN}/ppt/presentation.xml', 'w', encoding='utf-8').write(pres)
prels = prels.replace('</Relationships>', ''.join(rel_add) + '</Relationships>')
open(f'{UN}/ppt/_rels/presentation.xml.rels', 'w', encoding='utf-8').write(prels)
ct = ct.replace('</Types>', ''.join(ct_add) + '</Types>')
open(f'{UN}/[Content_Types].xml', 'w', encoding='utf-8').write(ct)

out = 'smaxtec_cowtalk_en_training_with_ai.pptx'
if os.path.exists(out): os.remove(out)
zf = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)
for root, _, files in os.walk(UN):
    for f in files:
        p = os.path.join(root, f)
        zf.write(p, os.path.relpath(p, UN))
zf.close()
print(f'wrote {out}: +{len(SLIDES)} slides (36–{base+len(SLIDES)})')
