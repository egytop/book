"""
بناء ملف الرواية المشفر مباشرة من ملف الـ docx، بباسورد تختاره.

الاستخدام:
    python3 build_novel.py path/to/novel.docx "الباسورد"

ملحوظات مهمة:
- السكريبت ده معمول عشان النص الصريح (غير المشفر) للرواية ميتكتبش
  على القرص أبدًا — بيتقرا من الـ docx، يتحول لـ JSON في الذاكرة بس،
  ويتشفّر فورًا، والملف الوحيد اللي بيتكتب هو الناتج المشفر
  docs/data/novel.enc.json.
- محتاج مكتبتين بايثون: python-docx و cryptography.
  لو مش موجودين: pip install python-docx cryptography

بيتوقع إن هيكل الفصول في الـ docx يبقى:
  Heading 1  = عنوان جزء (اختياري)
  Heading 2  = عنوان فصل / استهلال / خاتمة
  فقرات عادية = محتوى الفصل (الفقرات اللي كل السطور فيها مائلة
                بالكامل بتتحط كاقتباس/استهلال)
"""
import sys
import os
import json
import base64
import secrets

import docx
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'docs', 'data', 'novel.enc.json')

ITERATIONS = 250000
SALT_LEN = 16
IV_LEN = 12
KEY_LEN = 32


def is_epigraph(paragraph):
    runs = [r for r in paragraph.runs if r.text.strip()]
    if not runs:
        return False
    return all(r.italic for r in runs)


def extract(docx_path):
    d = docx.Document(docx_path)
    paras = d.paragraphs
    texts = [p.text.strip() for p in paras]

    # front matter — عدّل الأرقام دي لو شكل صفحة العنوان مختلف
    series_title = texts[2]
    book_title = texts[3]
    author = texts[8]

    chapters = []
    parts = []
    current_part = None
    current_chapter = None

    for p in paras[9:]:
        style = p.style.name
        text = p.text.strip()

        if style == 'Heading 1':
            if not text:
                continue
            current_part = {'title': text, 'chapterIds': []}
            parts.append(current_part)
            continue

        if style == 'Heading 2':
            if not text:
                continue
            current_chapter = {'id': len(chapters), 'title': text, 'paragraphs': []}
            chapters.append(current_chapter)
            if current_part is not None:
                current_part['chapterIds'].append(current_chapter['id'])
            continue

        if not text or current_chapter is None:
            continue
        current_chapter['paragraphs'].append({'t': text, 'q': is_epigraph(p)})

    return {
        'seriesTitle': series_title,
        'title': book_title,
        'author': author,
        'parts': parts,
        'chapters': chapters,
    }


def encrypt(data_dict, password):
    plaintext = json.dumps(data_dict, ensure_ascii=False).encode('utf-8')

    salt = secrets.token_bytes(SALT_LEN)
    iv = secrets.token_bytes(IV_LEN)
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=KEY_LEN, salt=salt, iterations=ITERATIONS)
    key = kdf.derive(password.encode('utf-8'))

    ciphertext = AESGCM(key).encrypt(iv, plaintext, None)

    return {
        'v': 1,
        'kdf': 'PBKDF2-SHA256',
        'iterations': ITERATIONS,
        'salt': base64.b64encode(salt).decode('ascii'),
        'iv': base64.b64encode(iv).decode('ascii'),
        'ciphertext': base64.b64encode(ciphertext).decode('ascii'),
    }


def main():
    if len(sys.argv) != 3:
        print('الاستخدام: python3 build_novel.py path/to/novel.docx "الباسورد"')
        sys.exit(1)
    docx_path, password = sys.argv[1], sys.argv[2]

    print('بيقرا وينظّم الفصول...')
    data = extract(docx_path)
    print('العنوان:', data['title'], '/', data['seriesTitle'])
    print('عدد الفصول:', len(data['chapters']))

    print('بيشفّر...')
    payload = encrypt(data, password)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(payload, f)

    print('تم ->', os.path.abspath(OUT))
    print('حجم الملف:', os.path.getsize(OUT), 'بايت')
    print('محدش لمس القرص بالنص الصريح — البيانات اتحولت وتشفّرت في الذاكرة بس.')


if __name__ == '__main__':
    main()
