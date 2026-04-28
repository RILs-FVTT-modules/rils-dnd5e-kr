#!/usr/bin/env node
/**
 * dnd5e 시스템 소스 YAML → Babele en JSON 변환 스크립트
 *
 * 사전 준비:
 *   npm install js-yaml
 *   git clone --depth 1 -b 5.3.x https://github.com/foundryvtt/dnd5e.git
 *
 * 실행:
 *   node scripts/extract-en.mjs <dnd5e-레포-경로>
 *
 * 예시:
 *   node scripts/extract-en.mjs ../dnd5e
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import yaml from 'js-yaml';

const DND5E_REPO = process.argv[2];
if (!DND5E_REPO) {
  console.error('사용법: node scripts/extract-en.mjs <dnd5e-레포-경로>');
  process.exit(1);
}

const SOURCE_DIR = join(DND5E_REPO, 'packs', '_source');
const OUTPUT_DIR = 'localization/compendium/en';

if (!existsSync(SOURCE_DIR)) {
  console.error(`오류: ${SOURCE_DIR} 를 찾을 수 없습니다. dnd5e 레포 경로를 확인하세요.`);
  process.exit(1);
}

// 기존 en 파일에서 mapping/label 보존용
function readExistingEn(packName) {
  const path = join(OUTPUT_DIR, `dnd5e.${packName}.json`);
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

// YAML 문서에서 Babele entry 데이터 추출
function extractEntry(doc) {
  const entry = { name: doc.name };

  const desc = doc.system?.description?.value;
  if (desc) entry.description = desc;

  // 배경/전기 (몬스터, 액터)
  const bio = doc.system?.details?.biography?.value;
  if (bio) entry.biography = bio;

  // 소재 성분 (주문)
  const material = doc.system?.materials?.value;
  if (material) entry.material = material;

  // 활동 (activities) - 이름만 추출
  const activities = doc.system?.activities;
  if (activities && typeof activities === 'object' && !Array.isArray(activities)) {
    const actEntries = {};
    for (const act of Object.values(activities)) {
      if (act?.name) actEntries[act.name] = { name: act.name };
    }
    if (Object.keys(actEntries).length > 0) entry.activities = actEntries;
  }

  // 이펙트 (이름 + 설명)
  const effects = doc.effects;
  if (Array.isArray(effects) && effects.length > 0) {
    const effectEntries = {};
    for (const effect of effects) {
      if (!effect?.name) continue;
      const effectEntry = { name: effect.name };
      const effectDesc = effect.description?.value ?? (typeof effect.description === 'string' ? effect.description : null);
      if (effectDesc) effectEntry.description = effectDesc;
      effectEntries[effect.name] = effectEntry;
    }
    if (Object.keys(effectEntries).length > 0) entry.effects = effectEntries;
  }

  // 페이지 (저널/규칙)
  const pages = doc.pages;
  if (Array.isArray(pages) && pages.length > 0) {
    const pageEntries = {};
    for (const page of pages) {
      if (!page?.name) continue;
      const pageEntry = { name: page.name };
      const pageText = page.text?.content;
      if (pageText) pageEntry.text = pageText;
      if (page.src) pageEntry.src = page.src;
      if (page.image?.caption) pageEntry.caption = page.image.caption;
      pageEntries[page.name] = pageEntry;
    }
    if (Object.keys(pageEntries).length > 0) entry.pages = pageEntries;
  }

  // 내장 아이템 (몬스터/액터에 포함된 무기, 특성 등)
  const items = doc.items;
  if (Array.isArray(items) && items.length > 0) {
    const itemEntries = {};
    for (const item of items) {
      if (!item?.name) continue;
      const itemEntry = { name: item.name };
      const itemDesc = item.system?.description?.value;
      if (itemDesc) itemEntry.description = itemDesc;
      itemEntries[item.name] = itemEntry;
    }
    if (Object.keys(itemEntries).length > 0) entry.items = itemEntries;
  }

  return entry;
}

// 팩 디렉토리를 재귀 순회하여 항목/폴더 수집
function processPackDir(dir, entries, folders) {
  let items;
  try {
    items = readdirSync(dir);
  } catch {
    return;
  }

  for (const item of items) {
    const fullPath = join(dir, item);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      // 서브폴더: _folder.yml에서 폴더 이름 읽기
      const folderYmlPath = join(fullPath, '_folder.yml');
      if (existsSync(folderYmlPath)) {
        try {
          const folderDoc = yaml.load(readFileSync(folderYmlPath, 'utf8'));
          const folderName = folderDoc?.name;
          if (folderName) folders[folderName] = folderName;
        } catch {
          // 무시
        }
      }
      processPackDir(fullPath, entries, folders);
    } else if (item.endsWith('.yml') && item !== '_folder.yml') {
      try {
        const doc = yaml.load(readFileSync(fullPath, 'utf8'));
        if (doc?.name) {
          entries[doc.name] = extractEntry(doc);
        }
      } catch (e) {
        console.warn(`  경고: ${fullPath} 파싱 실패 - ${e.message}`);
      }
    }
  }
}

// 메인: 각 팩 처리
const packs = readdirSync(SOURCE_DIR).filter((f) => {
  try {
    return statSync(join(SOURCE_DIR, f)).isDirectory();
  } catch {
    return false;
  }
});

console.log(`팩 ${packs.length}개 처리 시작...\n`);

for (const packName of packs) {
  const packDir = join(SOURCE_DIR, packName);
  const entries = {};
  const folders = {};

  processPackDir(packDir, entries, folders);

  const existing = readExistingEn(packName);

  const output = {
    label: existing?.label ?? packName,
    ...(existing?.mapping ? { mapping: existing.mapping } : {}),
    ...(Object.keys(folders).length > 0 ? { folders } : {}),
    entries,
  };

  const outputPath = join(OUTPUT_DIR, `dnd5e.${packName}.json`);
  writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');

  const isNew = !existing;
  console.log(
    `${isNew ? '[신규]' : '[갱신]'} dnd5e.${packName}.json — 항목 ${Object.keys(entries).length}개`,
  );
}

console.log('\n완료!');
console.log(`주의: 신규 팩은 mapping 필드가 없습니다. 필요시 수동으로 추가하세요.`);
