/* babele-register.js
 * 이 스크립트는 컴펜디움 번역 기능을 설정하고, 원어 병기 옵션을 처리합니다.
 */

/* 월드 설정에 옵션 등록 */
Hooks.once("init", () => {
  game.settings.register("dnd5e-ko", "show-original-name", {
    name: "컴펜디움 원어 병기",
    hint: "컴펜디움 원본 명칭을 번역된 명칭 옆에 나란히 표시합니다. 예시) 화염구 Fireball",
    scope: "world",
    config: true,
    default: false,
    type: Boolean,
    onChange: (_) => window.location.reload(),
  });

  if (typeof Babele === "undefined") return;

  game.babele.register({
    module: "dnd5e-ko",
    lang: "ko",
    dir: "localization/compendium/ko",
  });

  // 저널/규칙 페이지 번역 컨버터 등록
  // value: 문서의 pages 배열, translation: ko JSON의 pages 번역 객체
  game.babele.registerConverters({
    dndpages(value, translation) {
      return value.map((page) => {
        if (!translation) return page;

        let entry;
        if (Array.isArray(translation)) {
          entry = translation.find((t) => t.id === page._id || t.id === page.name);
        } else {
          entry = translation[page.name];
        }

        if (!entry) return page;

        return foundry.utils.mergeObject(page, {
          name: entry.name,
          image: { caption: entry.caption ?? page.image?.caption },
          src: entry.src ?? page.src,
          text: { content: entry.text ?? page.text?.content },
          video: {
            width: entry.width ?? page.video?.width,
            height: entry.height ?? page.video?.height,
          },
          system: entry.system ?? page.system,
          translated: true,
        });
      });
    },
  });
});

// 원어 병기 기능
// Babele 2.8.x의 babele.translateDocumentData 훅을 사용합니다.
// 이 훅은 컴펜디움 목록(인덱스) 및 문서(시트) 번역 모두에 적용됩니다.
Hooks.on("babele.translateDocumentData", (context) => {
  if (!game.settings.get("dnd5e-ko", "show-original-name")) return;

  const { source, translated } = context;

  // translated.name이 존재하고 원본과 다를 때만 병기
  if (translated.name && source.name && translated.name !== source.name) {
    context.translated.name = translated.name + " " + source.name;
  }
});
