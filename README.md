# Tiebreak-opstelling — gecontroleerde versie

## Bestanden voor GitHub
Vervang in je repository:
- index.html
- style.css
- app.js

Netlify publiceert daarna automatisch.

## Belangrijkste functies
- Alleen Deelnemer en Organisator als hoofdmenu.
- Organisator met een zelf in te stellen 4-cijferige pincode.
- Altijd precies twee dinsdagen, waarbij dinsdag om 21:00 wordt doorgeschoven.
- Ja / Misschien / Nee.
- Iedereen ziet wie welke status heeft.
- Standaard vier banen.
- Keuze uit baannummers 1 t/m 10.
- Automatische selectie en reserves.
- Selectie handmatig wijzigen.
- Automatische indeling en eenvoudig zelf indelen met keuzelijsten.
- Spelers wisselen in tiebreak 2 automatisch van baan.
- WhatsApp-voorbeeld vóór WhatsApp wordt geopend.
- Spelersbeheer onder Organisator.
- KNLTB-rating met één decimaal; komma en punt worden geaccepteerd.
- Import via tekst, CSV en Excel.
- CSV-export, JSON-back-up en statistieken.

## Beveiliging
De pincode voorkomt gewone gebruikersfouten in de interface. Omdat de app geen echte
Firebase Authentication gebruikt, zijn de tijdelijke Firestore-regels technisch open.
Deel de app daarom alleen met de eigen groep.

## Controle
- JavaScript-syntax is gecontroleerd.
- Datumlogica gebruikt lokale tijd en levert alleen dinsdagen.
- Bestandsverwijzingen zijn gecontroleerd.
- ZIP-integriteit is gecontroleerd.
