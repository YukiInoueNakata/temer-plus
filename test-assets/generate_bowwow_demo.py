"""
Bowwow_demo.pptx から TEMerPlus 用の .tem / .csv ファイルを生成するスクリプト
"""
import json, csv, os, time, random, math

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ============================================================================
# Box definitions: (id, type, label_en, label_ja, time_level, item_level, w, h)
# type: normal, OPP, BFP, EFP, P-EFP, annotation
# time_level: horizontal position (1 level = 100px in TEMerPlus)
# item_level: vertical position (positive = higher in user coords, negative = lower)
#   In TEMerPlus storage: y = -item_level * LEVEL_PX (since y-down in screen)
# ============================================================================

LEVEL_PX = 100

# For sizing: vertical text boxes are narrow and tall
# Standard box in this diagram: w=60, h=100-200 (vertical text)
BW, BH_S, BH_M, BH_L = 60, 100, 150, 200  # width, heights (small/med/large)
BW_WIDE = 90  # wider for longer text

boxes_en = [
    # Phase 1: Pre-conflict
    ("OPP1",   "OPP",    "Be interested in\nforeign countries",         2, 0, BW, BH_M),
    ("Item1",  "normal", "Take an English\nclass",                       3, 1, BW, BH_S),

    # Phase 2: Initial-conflict
    ("OPP2",   "OPP",    "Join an exchange\nprogram at high school\nand go to the U.S.", 5, 0, BW, BH_L),
    ("OPP3",   "OPP",    "Not to be called\nher name from\nthe teacher\nin the class",   6, 0, BW, BH_L),
    ("BFP1",   "BFP",    "Feeling shocked\nand saddened",                7, 2, BW, BH_M),
    ("Item2",  "normal", "Wanting people to\ncall her name",             7.5, 0, BW, BH_M),
    ("Item3",  "normal", "Take action to\nresolve the\nsituation",       8, 0, BW, BH_S),
    ("Item4",  "normal", "Unable to take\naction to resolve\nthe situation", 8, 3, BW, BH_M),
    ("Item5",  "normal", "Go back to Japan",                              9, 3, BW, BH_S),
    ("Item6",  "normal", "Go to study abroad\nin the Philippines",        9, 2, BW, BH_M),

    # Phase 3: Mid-conflict
    ("OPP4",   "OPP",    "Experiencing name\nmispronunciation\nin various situations", 10, 2, BW, BH_L),
    ("Item7",  "normal", "Teacher suggest\nher to have an\nEnglish name", 10.5, 1, BW, BH_M),
    ("BFP2",   "BFP",    "Start using an\nEnglish name",                 11, 0, BW, BH_M),
    ("Item8",  "normal", "Satisfying herself\nwith the solution",         11.5, -1, BW, BH_M),
    ("Item9",  "normal", "Be able to\ncommunicate\nsmoothly",             12, -1, BW, BH_M),
    ("Item10", "normal", "Do not use\nEnglish name",                      11, 4, BW, BH_S),
    ("Item11", "normal", "Get people to\npronounce her\nname correctly",  12.5, 3, BW, BH_M),
    ("Item12", "normal", "No longer\nencountering the\nsame situation",   10.5, 5, BW_WIDE, BH_S),
    ("Item13", "normal", "Do not Satisfying\nwith the solution",          12, 4, BW, BH_S),
    ("Item14", "normal", "Let the person\ncall as they like",             13, 5, BW, BH_S),
    ("Item15", "normal", "Want to go to\nlong-term study abroad",         13, -1, BW, BH_M),
    ("Item16", "normal", "Do not go to the\nlong-term study abroad",      13.5, 2, BW, BH_M),
    ("Item17", "normal", "Go back to Japan",                              13, 0, BW, BH_S),
    ("Item18", "normal", "Graduate a\nuniversity",                        14, 2, BW, BH_S),
    ("Item19", "normal", "Start working\nin Japan",                       14.5, 1, BW, BH_S),

    # Phase 4: Post-conflict
    ("Item20", "normal", "Decide to do\nwhat she really\nwants to do",    15.5, 0, BW, BH_M),
    ("Item21", "normal", "Start Covid-19\nPandemic",                      16, 1, BW, BH_M),
    ("Item22", "normal", "Go to Canada",                                  16.5, 0, BW, BH_S),
    ("BFP3",   "BFP",    "Keep using her\nEnglish name",                  17, -1, BW, BH_M),
    ("Item23", "normal", "Do not use her\nEnglish name",                  17, 3, BW, BH_S),
    ("OPP5",   "OPP",    "Experiencing to\nbe called her\nEnglish name\nin various situations", 18, -2, BW, BH_L),
    ("Item24", "normal", "Getting used to be\ncalled her\nEnglish name",  18.5, -3, BW, BH_M),
    ("Item25", "normal", "Do not get used to\nbe called her\nEnglish name", 18.5, 1, BW, BH_M),
    ("Item26", "normal", "Not be able to\ncommunicate smoothly",          18.5, 4, BW_WIDE, BH_M),

    # EFP / P-EFP
    ("EFP1",   "EFP",    "Satisfying herself\nwith the solution,\nand maintaining\nstable happiness", 20, -2, BW_WIDE, BH_L),
    ("P_EFP1", "P-EFP",  "Being unsatisfied\nwith the result\nand experiencing\nunstable well-beings", 20, 2, BW_WIDE, BH_L),
]

# Japanese translations
boxes_ja = [
    ("OPP1",   "OPP",    "外国に\n興味を持つ",                    2, 0, BW, BH_M),
    ("Item1",  "normal", "英語の授業を\n受ける",                  3, 1, BW, BH_S),
    ("OPP2",   "OPP",    "高校で交換\n留学プログラムに\n参加し渡米",  5, 0, BW, BH_L),
    ("OPP3",   "OPP",    "授業中に先生に\n名前を呼ばれ\nないようにする", 6, 0, BW, BH_L),
    ("BFP1",   "BFP",    "ショックと\n悲しみを感じる",            7, 2, BW, BH_M),
    ("Item2",  "normal", "人々に自分の\n名前を呼んで\nほしい",      7.5, 0, BW, BH_M),
    ("Item3",  "normal", "状況を改善する\nために行動する",          8, 0, BW, BH_S),
    ("Item4",  "normal", "状況を改善する\nために行動\nできない",    8, 3, BW, BH_M),
    ("Item5",  "normal", "日本に帰国",                             9, 3, BW, BH_S),
    ("Item6",  "normal", "フィリピンに\n留学する",                 9, 2, BW, BH_M),
    ("OPP4",   "OPP",    "様々な場面で\n名前の発音を\n間違えられる\n経験",  10, 2, BW, BH_L),
    ("Item7",  "normal", "先生から英語名を\n持つことを\n提案される",  10.5, 1, BW, BH_M),
    ("BFP2",   "BFP",    "英語名を\n使い始める",                   11, 0, BW, BH_M),
    ("Item8",  "normal", "解決策に\n満足する",                     11.5, -1, BW, BH_M),
    ("Item9",  "normal", "スムーズに\nコミュニケーション\nできる",   12, -1, BW, BH_M),
    ("Item10", "normal", "英語名を\n使わない",                     11, 4, BW, BH_S),
    ("Item11", "normal", "名前を正しく\n発音してもらう\nよう努力",   12.5, 3, BW, BH_M),
    ("Item12", "normal", "同じ状況に\n遭遇しなくなる",             10.5, 5, BW_WIDE, BH_S),
    ("Item13", "normal", "解決策に\n満足しない",                   12, 4, BW, BH_S),
    ("Item14", "normal", "相手に好きな\nように呼ばせる",           13, 5, BW, BH_S),
    ("Item15", "normal", "長期留学に\n行きたい",                   13, -1, BW, BH_M),
    ("Item16", "normal", "長期留学に\n行かない",                   13.5, 2, BW, BH_M),
    ("Item17", "normal", "日本に帰国",                             13, 0, BW, BH_S),
    ("Item18", "normal", "大学を卒業",                             14, 2, BW, BH_S),
    ("Item19", "normal", "日本で就職",                             14.5, 1, BW, BH_S),
    ("Item20", "normal", "本当にやりたい\nことをする\nことを決意",   15.5, 0, BW, BH_M),
    ("Item21", "normal", "新型コロナ\nパンデミック開始",           16, 1, BW, BH_M),
    ("Item22", "normal", "カナダに行く",                           16.5, 0, BW, BH_S),
    ("BFP3",   "BFP",    "英語名を\n使い続ける",                   17, -1, BW, BH_M),
    ("Item23", "normal", "英語名を\n使わない",                     17, 3, BW, BH_S),
    ("OPP5",   "OPP",    "様々な場面で\n英語名で呼ばれる\n経験",    18, -2, BW, BH_L),
    ("Item24", "normal", "英語名で呼ばれる\nことに慣れる",         18.5, -3, BW, BH_M),
    ("Item25", "normal", "英語名で呼ばれる\nことに慣れない",       18.5, 1, BW, BH_M),
    ("Item26", "normal", "スムーズに\nコミュニケーション\nできない",  18.5, 4, BW_WIDE, BH_M),
    ("EFP1",   "EFP",    "解決策に満足し\n安定した幸福を\n維持する",  20, -2, BW_WIDE, BH_L),
    ("P_EFP1", "P-EFP",  "結果に不満を\n感じ不安定な\nウェルビーイング",  20, 2, BW_WIDE, BH_L),
]

# ============================================================================
# Lines: (from_id, to_id, type)  RLine=solid, XLine=dashed
# ============================================================================
lines = [
    ("OPP1", "Item1", "RLine"),
    ("Item1", "OPP2", "RLine"),
    ("OPP2", "OPP3", "RLine"),
    ("OPP3", "BFP1", "RLine"),
    ("BFP1", "Item3", "RLine"),
    ("BFP1", "Item4", "XLine"),
    ("Item2", "Item3", "RLine"),
    ("Item3", "Item6", "RLine"),
    ("Item4", "Item5", "XLine"),
    ("Item5", "Item6", "XLine"),
    ("Item6", "OPP4", "RLine"),
    ("OPP4", "Item7", "RLine"),
    ("Item7", "BFP2", "RLine"),
    ("BFP2", "Item8", "RLine"),
    ("BFP2", "Item10", "XLine"),
    ("Item8", "Item9", "RLine"),
    ("Item9", "Item15", "RLine"),
    ("Item10", "Item11", "XLine"),
    ("Item10", "Item12", "XLine"),
    ("Item11", "Item13", "XLine"),
    ("Item13", "Item14", "XLine"),
    ("Item15", "Item17", "RLine"),
    ("Item16", "Item18", "RLine"),
    ("Item17", "Item15", "RLine"),
    ("Item18", "Item19", "RLine"),
    ("Item19", "Item20", "RLine"),
    ("Item20", "Item22", "RLine"),
    ("Item21", "Item20", "RLine"),
    ("Item22", "BFP3", "RLine"),
    ("BFP3", "OPP5", "RLine"),
    ("BFP3", "Item23", "XLine"),
    ("OPP5", "Item24", "RLine"),
    ("Item23", "Item25", "XLine"),
    ("Item23", "Item26", "XLine"),
    ("Item24", "EFP1", "RLine"),
    ("Item25", "P_EFP1", "XLine"),
    ("Item26", "P_EFP1", "XLine"),
]

# ============================================================================
# SD/SG: (id, type, label_en, label_ja, attached_to, item_offset, time_offset)
# SD (downArrowCallout): social direction (negative force)
# SG (upArrowCallout): social guide (positive force)
# ============================================================================
sdsg_en = [
    ("SD1", "SD", "The lack of confidence\nin herself",               "OPP3",  -120, 0),
    ("SD2", "SD", "Her name is difficult\nto remember",               "OPP3",  -120, -80),
    ("SD3", "SD", "The lack of confidence\nin English",               "BFP2",  -120, -60),
    ("SD4", "SD", "The lack of confidence\nabout herself and\nher English skill", "Item15", -120, 20),
    ("SD5", "SD", "The reluctance to draw\non parents financially",   "Item15", -120, 80),

    ("SG1", "SG", "Were used to go to\nEnglish conversation classes", "OPP1",  130, 0),
    ("SG2", "SG", "Her name is relatively\ndifficult for anyone\nto pronounce", "OPP4", 130, -40),
    ("SG3", "SG", "Mutually comfortable\nand stress-free",            "BFP2",  150, 30),
    ("SG4", "SG", "Feel happy that people\ncall her with her\nEnglish name",  "BFP2", 150, 80),
    ("SG5", "SG", "Keep having a dream\nto live in a\nforeign country since a child", "Item18", 150, 0),
    ("SG6", "SG", "Have money\nof her own",                          "Item20", 130, 40),
    ("SG7", "SG", "Already quite a\njob in Japan",                   "Item20", 130, -40),
    ("SG8", "SG", "A strong will\nto go there",                      "Item22", 130, 0),
    ("SG9", "SG", "Be able to\ncommunicate smoothly",                "BFP3",  150, 80),
    ("SG10","SG", "Mutually comfortable\nand stress-free with\nher English name", "OPP5", 150, 40),
    ("SG11","SG", "Feel authentic when\nusing an English name",       "EFP1",  130, 0),
]

sdsg_ja = [
    ("SD1", "SD", "自分に対する\n自信の欠如",             "OPP3",  -120, 0),
    ("SD2", "SD", "名前が覚え\nにくい",                   "OPP3",  -120, -80),
    ("SD3", "SD", "英語に対する\n自信の欠如",             "BFP2",  -120, -60),
    ("SD4", "SD", "自分と英語力に\n対する自信の欠如",     "Item15", -120, 20),
    ("SD5", "SD", "経済的に親に\n頼りたくない",           "Item15", -120, 80),

    ("SG1", "SG", "英会話教室に\n通っていた",             "OPP1",  130, 0),
    ("SG2", "SG", "名前が誰にとっても\n発音しにくい",     "OPP4",  130, -40),
    ("SG3", "SG", "互いに心地よく\nストレスフリー",       "BFP2",  150, 30),
    ("SG4", "SG", "英語名で呼ばれて\n嬉しい",             "BFP2",  150, 80),
    ("SG5", "SG", "子供の頃からの\n海外生活への夢",       "Item18", 150, 0),
    ("SG6", "SG", "自分のお金が\nある",                   "Item20", 130, 40),
    ("SG7", "SG", "日本でかなり\n仕事をした",             "Item20", 130, -40),
    ("SG8", "SG", "そこに行く\n強い意志",                 "Item22", 130, 0),
    ("SG9", "SG", "スムーズに\nコミュニケーション\nできる",  "BFP3",  150, 80),
    ("SG10","SG", "英語名で互いに\n心地よくストレスフリー", "OPP5",  150, 40),
    ("SG11","SG", "英語名を使う時に\n本来の自分を\n感じる", "EFP1",  130, 0),
]

# Period labels
periods_en = [
    ("Phase 1:\nPre-conflict",    1),
    ("Phase 2:\nInitial-conflict", 4.5),
    ("Phase 3:\nMid-conflict",     10),
    ("Phase 4:\nPost-conflict",    15),
]
periods_ja = [
    ("第1期:\n紛争前段階",     1),
    ("第2期:\n紛争初期段階",   4.5),
    ("第3期:\n紛争中期段階",   10),
    ("第4期:\n紛争後段階",     15),
]

# ============================================================================
# Helper: generate TEM document
# ============================================================================
def gen_id():
    return f"{int(time.time()*1000)%1000000}_{random.randint(1000,9999)}"

def make_tem(boxes, sdsg, periods, title, locale):
    LEVEL_PX = 100
    sheet_id = f"Sheet_{gen_id()}"

    # Convert boxes to TEMerPlus format
    tem_boxes = []
    for (bid, btype, label, tl, il, w, h) in boxes:
        x = tl * LEVEL_PX
        y = -il * LEVEL_PX  # item_level positive = up, y positive = down
        tem_boxes.append({
            "id": bid,
            "type": btype,
            "label": label,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "textOrientation": "vertical",
        })

    # Convert lines
    tem_lines = []
    for (from_id, to_id, ltype) in lines:
        lid = f"RL_{from_id}_{to_id}"
        tem_lines.append({
            "id": lid,
            "type": ltype,
            "from": from_id,
            "to": to_id,
            "connectionMode": "center-to-center",
            "shape": "straight",
        })

    # Convert SD/SG
    tem_sdsg = []
    for (sid, stype, label, attached, ioff, toff) in sdsg:
        tem_sdsg.append({
            "id": sid,
            "type": stype,
            "label": label,
            "attachedTo": attached,
            "itemOffset": ioff,
            "timeOffset": toff,
            "width": 100,
            "height": 50,
        })

    # Period labels
    tem_periods = []
    for (plabel, pos) in periods:
        tem_periods.append({
            "id": f"P_{gen_id()}",
            "position": pos,
            "label": plabel,
        })

    doc = {
        "version": "0.3",
        "sheets": [{
            "id": sheet_id,
            "name": "Bowwow",
            "type": "individual",
            "order": 0,
            "boxes": tem_boxes,
            "lines": tem_lines,
            "sdsg": tem_sdsg,
            "annotations": [],
            "comments": [],
            "periodLabels": tem_periods,
        }],
        "activeSheetId": sheet_id,
        "participants": [{"id": f"Part_{gen_id()}", "pseudonym": "Bowwow"}],
        "settings": {
            "layout": "horizontal",
            "locale": locale,
            "gridSize": 10,
            "snap": {"alignGuides": True, "distanceSnap": True, "distancePx": 20, "gridSnap": False, "gridPx": 10},
            "showLegend": True,
            "legendPosition": "right",
            "timelineLabel": {"ja": "非可逆的時間", "en": "Irreversible time"},
            "timelineAutoInsert": True,
            "defaultFont": "system-ui",
            "defaultFontSize": 11,
            "defaultBoxSize": {"width": 60, "height": 100},
            "defaultAutoFitText": False,
            "defaultAutoFitBox": False,
            "defaultAutoFitBoxMode": "none",
            "paperGuides": [{"enabled": False, "size": "A4-landscape", "baseSize": "A4", "color": "#000000", "pageCount": 2, "maskOutside": True}],
            "uiFontSize": 13,
            "ribbonFontSize": 12,
            "levelStep": 0.5,
            "timeArrow": {
                "autoInsert": True, "alwaysVisible": True,
                "timeStartExtension": -0.5, "timeEndExtension": 0.5,
                "itemReference": "min", "itemOffset": -1,
                "label": "Irreversible Time" if locale == "en" else "非可逆的時間",
                "strokeWidth": 2.5, "fontSize": 14,
                "labelSideHorizontal": "bottom", "labelSideVertical": "left",
                "labelBold": False, "labelItalic": False, "labelUnderline": False,
                "labelOffset": 4,
                "labelAlignHorizontal": "center", "labelAlignVertical": "center",
            },
            "legend": {
                "autoGenerate": True, "alwaysVisible": True, "includeInExport": True,
                "position": {"x": 2100, "y": -450},
                "includeBoxes": True, "includeLines": True, "includeSDSG": True, "includeTimeArrow": True,
                "title": "Legend" if locale == "en" else "凡例",
                "fontSize": 11, "minWidth": 200, "showDescriptions": False,
                "columns": 1, "columnsHorizontal": 1, "columnsVertical": 1,
                "showTitle": True, "titleBold": True, "titleItalic": False,
                "titleUnderline": False, "titleAlign": "left", "titlePosition": "top",
                "titleWritingMode": "horizontal", "titleVerticalAlign": "top",
                "backgroundStyle": "white", "borderWidth": 1, "borderColor": "#999",
                "sampleWidth": 32, "sampleHeight": 18,
                "titleSeparatorVisible": True, "titleSeparatorColor": "#dddddd",
                "itemOverrides": {},
            },
            "periodLabels": {
                "alwaysVisible": True, "includeInExport": True,
                "itemReference": "max", "itemOffset": 1.5,
                "fontSize": 13, "showDividers": True, "dividerStrokeWidth": 1,
                "bandStyle": "band",
                "labelSideHorizontal": "top", "labelSideVertical": "right",
            },
            "typeLabelVisibility": {
                "BFP": True, "EFP": True, "P-EFP": True, "OPP": True,
                "2nd-EFP": True, "P-2nd-EFP": True, "SD": True, "SG": True,
            },
        },
        "metadata": {
            "title": title,
            "author": "Yuki Inoue Nakata",
            "createdAt": "2026-04-20T00:00:00.000Z",
            "modifiedAt": "2026-04-20T00:00:00.000Z",
        },
        "history": [],
    }
    return doc


# ============================================================================
# CSV generation (8 files: 4 types x 2 languages)
# ============================================================================
def write_csv(path, headers, rows):
    with open(path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f)
        w.writerow(headers)
        w.writerows(rows)

def gen_csvs(boxes, sdsg, locale_tag, label_idx=2):
    """Generate 4 CSV variants for one language"""
    prefix = f"Bowwow_demo_{locale_tag}"

    # 1. Label only
    rows = [[b[label_idx]] for b in boxes]
    rows += [[s[label_idx]] for s in sdsg]
    write_csv(os.path.join(OUT_DIR, "samples", f"{prefix}_label_only.csv"),
              ["Label"], rows)

    # 2. Label + position (Time_Level, Item_Level)
    rows = [[b[label_idx], b[3], b[4]] for b in boxes]
    write_csv(os.path.join(OUT_DIR, "samples", f"{prefix}_label_position.csv"),
              ["Label", "Time_Level", "Item_Level"], rows)

    # 3. Label + type
    type_map = {"normal": "通常" if locale_tag=="ja" else "Normal",
                "OPP": "OPP", "BFP": "BFP", "EFP": "EFP", "P-EFP": "P-EFP", "annotation": "Annotation"}
    rows = [[b[label_idx], type_map.get(b[1], b[1])] for b in boxes]
    for s in sdsg:
        rows.append([s[label_idx], s[1]])
    write_csv(os.path.join(OUT_DIR, "samples", f"{prefix}_label_type.csv"),
              ["Label", "Type"], rows)

    # 4. Label + type + position
    rows = [[b[label_idx], type_map.get(b[1], b[1]), b[3], b[4]] for b in boxes]
    write_csv(os.path.join(OUT_DIR, "samples", f"{prefix}_label_type_position.csv"),
              ["Label", "Type", "Time_Level", "Item_Level"], rows)


# ============================================================================
# Main
# ============================================================================
os.makedirs(os.path.join(OUT_DIR, "samples"), exist_ok=True)

# English .tem
doc_en = make_tem(boxes_en, sdsg_en, periods_en, "Bowwow Demo (EN)", "en")
with open(os.path.join(OUT_DIR, "samples", "Bowwow_demo_en.tem"), 'w', encoding='utf-8') as f:
    json.dump(doc_en, f, ensure_ascii=False, indent=2)

# Japanese .tem
doc_ja = make_tem(boxes_ja, sdsg_ja, periods_ja, "Bowwow Demo (JA)", "ja")
with open(os.path.join(OUT_DIR, "samples", "Bowwow_demo_ja.tem"), 'w', encoding='utf-8') as f:
    json.dump(doc_ja, f, ensure_ascii=False, indent=2)

# CSVs
gen_csvs(boxes_en, sdsg_en, "en")
gen_csvs(boxes_ja, sdsg_ja, "ja")

print("Generated files:")
for fn in sorted(os.listdir(os.path.join(OUT_DIR, "samples"))):
    if "Bowwow" in fn or "bowwow" in fn:
        print(f"  samples/{fn}")
