# DG Stand Unite - Diagnostika

React aplikace pro GUI diagnostiku na stand unite systémy.

## Popis projektu

Tato aplikace poskytuje grafické uživatelské rozhraní pro diagnostiku a monitoring systémů stand unite. Aplikace je postavena na moderních technologiích React a Vite pro rychlý vývoj a optimální výkon.

## Funkce

- **Systémový monitoring**: Sledování CPU, paměti, teploty a napětí
- **Diagnostické testy**: Automatizované testy elektrických, mechanických a komunikačních systémů
- **Real-time protokol**: Živé zobrazení průběhu testů a výsledků
- **Responzivní design**: Funkční na desktopech i mobilních zařízeních

## Technologie

- React 19
- Vite 7
- Modern CSS3 s Grid a Flexbox
- ESLint pro kvalitu kódu

## Instalace a spuštění

### Prerekvizity

- Node.js (verze 18 nebo vyšší)
- npm

### Postup instalace

1. Naklonujte repozitář:
```bash
git clone https://github.com/Senseszone/DG_stand_unite.git
cd DG_stand_unite
```

2. Nainstalujte závislosti:
```bash
npm install
```

3. Spusťte vývojový server:
```bash
npm run dev
```

Aplikace bude dostupná na `http://localhost:5173`

### Produkční build

```bash
npm run build
```

### Náhled produkční verze

```bash
npm run preview
```

## Struktura projektu

```
src/
├── components/
│   ├── Header.jsx              # Hlavička aplikace
│   ├── Header.css
│   ├── StatusPanel.jsx         # Panel se systémovými metrikami
│   ├── StatusPanel.css
│   ├── DiagnosticDashboard.jsx # Hlavní dashboard s testy
│   └── DiagnosticDashboard.css
├── App.jsx                     # Hlavní komponenta aplikace
├── App.css
├── main.jsx                    # Entry point
└── index.css
```

## Dostupné kategorie testů

### Elektrické systémy
- Test napětí - Kontrola napájecích okruhů
- Test proudu - Měření odběru proudu  
- Test odporu - Kontrola izolace

### Mechanické systémy
- Test motorů - Kontrola funkce motorů
- Test senzorů - Kalibrace a funkčnost senzorů
- Test aktuátorů - Kontrola pohyblivých částí

### Komunikační systémy
- Test sítě - Kontrola síťového připojení
- Test protokolů - Verifikace komunikačních protokolů
- Test dat - Kontrola integrity dat

## Vývoj

### Linting

```bash
npm run lint
```

### Přidání nových testů

1. Upravte `diagnosticCategories` v `DiagnosticDashboard.jsx`
2. Přidejte odpovídající logiku do funkce `runTest`
3. Aktualizujte styly dle potřeby

## Licence

MIT License
