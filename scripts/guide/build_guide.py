import json, os, sys, html
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, PageBreak, Table, TableStyle,
                                KeepTogether, Flowable)
from reportlab.platypus.tableofcontents import TableOfContents

SCR = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1]
pdfmetrics.registerFont(TTFont("A", r"C:\Windows\Fonts\arial.ttf"))
pdfmetrics.registerFont(TTFont("A-B", r"C:\Windows\Fonts\arialbd.ttf"))
pdfmetrics.registerFont(TTFont("A-I", r"C:\Windows\Fonts\ariali.ttf"))
pdfmetrics.registerFontFamily("A", normal="A", bold="A-B", italic="A-I", boldItalic="A-B")

VIOLET = colors.HexColor("#7c3aed")
INK = colors.HexColor("#1f2937")
MUTED = colors.HexColor("#6b7280")
TIP_BG = colors.HexColor("#f5f3ff")

T = {
    "en": dict(title="The guide: how to work with people every day",
               sub="From the first login to a rhythm: the list, the funnel, the plan of the day, the team",
               toc="Contents", footer="MLM CRM · The guide", page="p.",
               cheat="Cheat sheet by stage",
               cheat_intro="What to do with a person at each stage of the funnel, and which next step to set. The wordings from the second row on are what the app offers in auto-plans; change them to suit you.",
               cols=["Stage", "What to do", "Next step", "In"], d="d",
               stages=["New lead", "First contact", "Warming up", "Presentation", "Deciding", "Client", "Partner"],
               todo=["Note how you know them; do not filter", "Find out what interests them", "Give materials, offer a time for the presentation", "Hold it and ask for impressions", "Answer questions and call for the decision", "Congratulate, explain the next steps", "Launch them, make the start plan"],
               nxt0="Decide whom to write to first",
               next="What next",
               next_text="Open the Start section in the app: its steps tick themselves as you work. Need a hint on any topic? Look in the Knowledge base: it holds the same articles as this guide, with search and links to the screens."),
    "ru": dict(title="Руководство: как работать с людьми каждый день",
               sub="От первого входа до ритма: список, воронка, план дня, команда",
               toc="Содержание", footer="MLM CRM · Руководство", page="стр.",
               cheat="Шпаргалка по этапам",
               cheat_intro="Что делать с человеком на каждом этапе воронки и какой следующий шаг поставить. Формулировки со второй строки: то, что приложение предлагает в автопланах. Меняйте их под себя.",
               cols=["Этап", "Что делать", "Следующий шаг", "Через"], d="д",
               stages=["Новый контакт", "Первый контакт", "Прогрев", "Презентация", "Принимает решение", "Клиент", "Партнёр"],
               todo=["Записать, откуда знаете; не фильтровать", "Узнать, что ему интересно", "Дать материалы, предложить время презентации", "Провести и спросить впечатления", "Ответить на вопросы и позвать к решению", "Поздравить, объяснить следующие шаги", "Запустить, составить стартовый план"],
               nxt0="Решить, кому написать первым",
               next="Что дальше",
               next_text="Откройте раздел «Старт» в приложении: его шаги отмечаются сами по мере работы. Нужна подсказка по теме? Загляните в базу знаний: там те же статьи, что в этом руководстве, с поиском и ссылками на экраны."),
}
DAYS = ["FIRST_CONTACT", "WARMING", "PRESENTATION", "DECIDING", "CLIENT", "PARTNER"]
DAYN = [2, 3, 1, 2, 3, 1]

data = json.load(open(os.path.join(SCR, "kb.json"), encoding="utf-8"))


def build(lang, out):
    d, t = data[lang], T[lang]
    st = {
        "body": ParagraphStyle("body", fontName="A", fontSize=10.5, leading=15, textColor=INK, spaceAfter=6),
        "h1": ParagraphStyle("h1", fontName="A-B", fontSize=20, leading=25, textColor=INK, spaceBefore=0, spaceAfter=4),
        "sum": ParagraphStyle("sum", fontName="A-I", fontSize=11, leading=15, textColor=MUTED, spaceAfter=10),
        "h2": ParagraphStyle("h2", fontName="A-B", fontSize=13.5, leading=18, textColor=VIOLET, spaceBefore=10, spaceAfter=4),
        "h3": ParagraphStyle("h3", fontName="A-B", fontSize=11.5, leading=15, textColor=INK, spaceBefore=6, spaceAfter=3),
        "li": ParagraphStyle("li", fontName="A", fontSize=10.5, leading=15, textColor=INK, leftIndent=14, bulletIndent=2, spaceAfter=2),
        "tip": ParagraphStyle("tip", fontName="A", fontSize=10.5, leading=15, textColor=INK),
        "cat": ParagraphStyle("cat", fontName="A-B", fontSize=26, leading=32, textColor=INK),
        "cell": ParagraphStyle("cell", fontName="A", fontSize=9, leading=12, textColor=INK),
        "cellh": ParagraphStyle("cellh", fontName="A-B", fontSize=9, leading=12, textColor=colors.white),
    }

    def inl(items):
        s = ""
        for it in items:
            v = html.escape(it["v"])
            if it["t"] == "bold":
                s += f"<b>{v}</b>"
            elif it["t"] == "link":
                s += f'<font color="#7c3aed">{v}</font>'
            else:
                s += v
        return s

    class Chapter(Flowable):
        pass

    class Doc(BaseDocTemplate):
        def afterFlowable(self, fl):
            if isinstance(fl, Paragraph):
                n = getattr(fl, "_toc", None)
                if n:
                    lvl, text = n
                    key = f"k{self.seq.nextf('toc')}"
                    self.canv.bookmarkPage(key)
                    self.canv.addOutlineEntry(text, key, lvl, 0)
                    self.notify("TOCEntry", (lvl, text, self.page, key))

    def footer(c, doc):
        if doc.page == 1:
            return
        c.saveState()
        c.setFont("A", 8.5)
        c.setFillColor(MUTED)
        c.drawString(20 * mm, 12 * mm, t["footer"])
        c.drawRightString(A4[0] - 20 * mm, 12 * mm, f'{t["page"]} {doc.page}')
        c.restoreState()

    doc = Doc(out, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
              title=t["footer"], author="MLM CRM")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(20 * mm, 20 * mm, A4[0] - 40 * mm, A4[1] - 40 * mm, id="f")], onPage=footer)])

    def tp(text, style, lvl):
        p = Paragraph(html.escape(text), style)
        p._toc = (lvl, text)
        return p

    story = []
    # cover
    story += [Spacer(1, 70 * mm), Paragraph('<font color="#7c3aed">MLM CRM</font>', ParagraphStyle("c0", fontName="A-B", fontSize=16, leading=20)),
              Spacer(1, 6 * mm), Paragraph(html.escape(t["title"]), ParagraphStyle("c1", fontName="A-B", fontSize=30, leading=36, textColor=INK)),
              Spacer(1, 6 * mm), Paragraph(html.escape(t["sub"]), ParagraphStyle("c2", fontName="A", fontSize=13, leading=18, textColor=MUTED)), PageBreak()]
    # contents
    toc = TableOfContents()
    toc.levelStyles = [
        ParagraphStyle("t0", fontName="A-B", fontSize=12, leading=20, spaceBefore=8, textColor=INK),
        ParagraphStyle("t1", fontName="A", fontSize=10.5, leading=16, leftIndent=10, textColor=INK),
    ]
    story += [Paragraph(html.escape(t["toc"]), st["h1"]), Spacer(1, 4 * mm), toc, PageBreak()]
    # chapters
    arts = d["articles"]
    for ci, cname in enumerate(d["cats"]):
        cat = ["start", "people", "tools", "rhythm"][ci]
        story.append(tp(cname, st["cat"], 0))
        story.append(Spacer(1, 6 * mm))
        story.append(PageBreak())
        for a in [x for x in arts if x["category"] == cat]:
            story.append(tp(a["title"], st["h1"], 1))
            story.append(Paragraph(html.escape(a["summary"]), st["sum"]))
            for b in a["blocks"]:
                ty = b["type"]
                if ty == "h2":
                    story.append(Paragraph(html.escape(b["text"]), st["h2"]))
                elif ty == "h3":
                    story.append(Paragraph(html.escape(b["text"]), st["h3"]))
                elif ty == "p":
                    story.append(Paragraph(inl(b["inline"]), st["body"]))
                elif ty in ("ul", "ol"):
                    for i, it in enumerate(b["items"]):
                        bullet = "•" if ty == "ul" else f"{i + 1}."
                        story.append(Paragraph(inl(it), st["li"], bulletText=bullet))
                    story.append(Spacer(1, 4))
                elif ty == "tip":
                    tb = Table([[Paragraph(inl(b["inline"]), st["tip"])]], colWidths=[A4[0] - 40 * mm])
                    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TIP_BG), ("LINEBEFORE", (0, 0), (0, -1), 3, VIOLET),
                                            ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                                            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
                    story += [Spacer(1, 2), tb, Spacer(1, 8)]
            story.append(PageBreak())
    # cheat sheet
    ad = d["autoDefault"]
    story.append(tp(t["cheat"], st["cat"], 0))
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(html.escape(t["cheat_intro"]), st["body"]))
    rows = [[Paragraph(html.escape(c), st["cellh"]) for c in t["cols"]]]
    for i, s in enumerate(t["stages"]):
        if i == 0:
            nxt, days = t["nxt0"], "—"
        else:
            nxt, days = ad[DAYS[i - 1]], f"{DAYN[i - 1]} {t['d']}"
        rows.append([Paragraph(f"<b>{html.escape(s)}</b>", st["cell"]), Paragraph(html.escape(t["todo"][i]), st["cell"]), Paragraph(html.escape(nxt), st["cell"]), Paragraph(days, st["cell"])])
    tb = Table(rows, colWidths=[30 * mm, 58 * mm, 66 * mm, 16 * mm], repeatRows=1)
    tb.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), VIOLET), ("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, TIP_BG]), ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#e5e7eb")),
                            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story += [tb, Spacer(1, 10 * mm), Paragraph(html.escape(t["next"]), st["h2"]), Paragraph(html.escape(t["next_text"]), st["body"])]
    doc.multiBuild(story)


build("en", os.path.join(SCR, "MLM-CRM-guide-en.pdf"))
build("ru", os.path.join(SCR, "MLM-CRM-guide-ru.pdf"))
print("ok")
