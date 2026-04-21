"""
Bowwow_demo_*.tem の band モード版を生成
  - 全 SD を band-top へ
  - 全 SG を band-bottom へ
  - settings.sdsgSpace.enabled = true
  - timeOffset / itemOffset は 0 にリセット
"""
import json, os

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "samples")

for lang in ("en", "ja"):
    src = os.path.join(OUT_DIR, f"Bowwow_demo_{lang}.tem")
    dst = os.path.join(OUT_DIR, f"Bowwow_demo_{lang}_band.tem")
    with open(src, encoding="utf-8") as f:
        doc = json.load(f)

    # SDSG の配置モードを一括変更
    for sh in doc["sheets"]:
        for sg in sh["sdsg"]:
            if sg["type"] == "SD":
                sg["spaceMode"] = "band-top"
            else:
                sg["spaceMode"] = "band-bottom"
            # オフセットは帯モードで使わないのでリセット
            sg["timeOffset"] = 0
            sg["itemOffset"] = 0

    # 帯機能を有効化（hydrate されるが明示）
    settings = doc["settings"]
    settings["sdsgSpace"] = {
        "enabled": True,
        "bands": {
            "top": {
                "enabled": True,
                "heightLevel": 1.5,
                "reference": "period",
                "offsetLevel": 0.2,
                "showBorder": True,
                "borderColor": "#9b59b6",
                "fillStyle": "tinted",
                "labelPosition": "top-left",
                "shrinkToFitRow": True,
                "autoExpandHeight": True,
            },
            "bottom": {
                "enabled": True,
                "heightLevel": 1.5,
                "reference": "timearrow",
                "offsetLevel": 0.2,
                "showBorder": True,
                "borderColor": "#27ae60",
                "fillStyle": "tinted",
                "labelPosition": "top-left",
                "shrinkToFitRow": True,
                "autoExpandHeight": True,
            },
        },
        "autoPlaceSD": "top",
        "autoPlaceSG": "bottom",
        "allowMismatchedPlacement": False,
        "autoArrange": True,
        "autoFlipDirectionInBand": False,
    }

    # タイトル変更
    doc["metadata"]["title"] = f"Bowwow Demo ({lang.upper()}, Band)"

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=2)
    print(f"Generated: {dst}")
