import os

final_file = r'C:\Users\PC6297_BD26\Desktop\stajier\prod\frontend\src\components\ConfigPage.tsx'
part1_file = r'C:\Users\PC6297_BD26\Desktop\stajier\prod\frontend\part1.tsx'
part2_file = r'C:\Users\PC6297_BD26\Desktop\stajier\prod\frontend\part2.tsx'

with open(part1_file, 'r', encoding='utf-8') as f:
    part1 = f.read()

with open(part2_file, 'r', encoding='utf-8') as f:
    part2 = f.read()

with open(final_file, 'w', encoding='utf-8') as f:
    f.write(part1 + '\n' + part2)

print("Concatenation complete")
