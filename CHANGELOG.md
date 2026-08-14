# Wijzigingen

## v2.3.6

- Firestore Test Mode vervangen door permanente Security Rules.
- Organisator-PIN wordt server-side gecontroleerd via een Firebase Cloud Function en Firebase Auth custom claim.
- De PIN-hash in `settings/organizer` is niet meer leesbaar of schrijfbaar vanuit de browser.
- Beheercollecties zijn alleen schrijfbaar voor een geauthenticeerde organisator.
- Deelnemers mogen zonder account uitsluitend geldige Ja/Misschien/Nee-reacties opslaan.
- Cloud Function houdt archiefreacties bij en verstuurt de dringende pushmelding bij een nieuwe Ja-aanmelding.
- Tijdelijke blokkade na meerdere foutieve PIN-pogingen toegevoegd.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.6.

## v2.3.5

- Nieuwe definitieve maskable appiconen voor Android toegevoegd.
- Maskable iconen hebben nieuwe v235-bestandsnamen om oude Android-cache te omzeilen.
- Manifest en serviceworker verwijzen naar de nieuwe maskable iconen.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.5.

## v2.3.4

- Eén speler kan afzonderlijk naar **Geen reactie** worden teruggezet.
- Meerdere geselecteerde spelers kunnen tegelijk worden gereset.
- Andere aanmeldingen blijven bij deze reset behouden.
- **Dringende oproep beëindigen** zet `urgentCalls.active` automatisch op `false`.
- Oude, uitgeschakelde en dubbele apparaatregistraties worden automatisch verwijderd.
- Vóór een dringende melding worden de oproepstatus en pushregistraties opnieuw gecontroleerd.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.4.

## v2.3.3

- Pushstatus wordt bij het openen van de app automatisch opnieuw gecontroleerd.
- Een geldige Firebase-token wordt automatisch vernieuwd en opnieuw opgeslagen.
- De VAPID-sleutel wordt opnieuw uit Firestore geladen, zodat het veld niet meer onterecht leeg lijkt.
- De gewone PWA-serviceworker en Firebase Messaging zijn samengevoegd tot één serviceworker.
- Hiermee wordt voorkomen dat twee serviceworkers elkaar vervangen.
- Manifest-verwijzingen naar de appiconen gecorrigeerd.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.3.

## v2.3.2

- De gewone GitHub-upload bevat geen map `functions` meer.
- Alle bestanden voor GitHub Pages staan nu los in de hoofdmap en zijn daardoor eenvoudig vanaf een telefoon te selecteren.
- De pushfunctie in de webapp is behouden.
- De Firebase Cloud Function blijft een eenmalige, aparte installatie en hoeft niet in GitHub Pages te staan.
- De aanmeldvolgorde uit v2.3.1 is volledig behouden.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.2.

## v2.3.1

- Aangemelde spelers krijgen automatisch een vast aanmeldnummer op basis van hun eerste ja-aanmelding.
- De aanmeldvolgorde is zichtbaar voor deelnemers én in het organisatorscherm.
- Aangemelde spelers worden in die volgorde getoond, zodat snel duidelijk is wie als eerste was bij overinschrijving.
- Een bestaand aanmeldnummer blijft bewaard wanneer iemand later op misschien of nee drukt.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.1.

# Changelog

## v2.3.0
- **Dringend speler gezocht** start voortaan een actieve dringende oproep.
- De organisator kan de dringende oproep handmatig beëindigen.
- Een speler die zich tijdens een actieve oproep op **Ja** zet, maakt automatisch een melding aan.
- Pushmeldingen kunnen per apparaat worden in- en uitgeschakeld.
- Firebase Cloud Messaging en een Cloud Function sturen de melding naar ingeschakelde organisator-apparaten.
- Cache- en versieverwijzingen bijgewerkt naar v2.3.0.

## v2.2.1
- App-iconen kregen nieuwe bestandsnamen, zodat Android niet langer een oud icoon uit de cache gebruikt.
- Aparte veilige maskable-iconen toegevoegd met extra ruimte rondom het logo.
- Hierdoor blijft de tekst SUPERTIEBREAK binnen de afgeronde Android-vorm zichtbaar.
- Manifest, Apple Touch Icon, serviceworker en alle cacheverwijzingen bijgewerkt.
- Geen wijzigingen aan deelnemers, indelingen, WhatsApp-berichten of Firebase-gegevens.

## v2.2.0
- Nieuwe beheerfunctie **Niet samen op één baan** toegevoegd.
- De automatische indeling zet ingestelde spelers nooit op dezelfde baan.
- Bij handmatig indelen verschijnt een waarschuwing wanneer zo'n combinatie toch op één baan staat.
- Nieuwe WhatsApp-knop **Speelavond afgelast** met een vrij, optioneel tekstveld voor de reden.
- Zonder ingevulde reden gebruikt de app automatisch een nette standaardtekst.
- **Weging automatische indeling** uit Beheer verwijderd; de app gebruikt voortaan vaste, optimale instellingen.
- De zichtbare score **Indelingskwaliteit** verwijderd om het indelingsscherm eenvoudiger te maken.
- Versie- en cacheverwijzingen bijgewerkt naar v2.2.0.

## v2.1.2
- Nieuw professioneel Supertiebreak-appicoon toegevoegd.
- Android-iconen van 192 × 192 en 512 × 512 pixels vervangen.
- Apple Touch Icon voor iPhone en iPad vervangen.
- Icooncache vernieuwd zodat het nieuwe logo na opnieuw toevoegen aan het beginscherm wordt gebruikt.
- Geen wijzigingen aan deelnemers, indelingen, archief of Firebase-gegevens.

## v2.1.1
- De rechtstreekse Android-installatieprompt is verwijderd.
- Android gebruikt nu uitsluitend de veilige browseroptie **Toevoegen aan startscherm**.
- Hierdoor wordt geen APK of onbekende app aangeboden en verschijnt Play Protect niet door de knop in de webapp.
- Duidelijke stappen toegevoegd voor Chrome, Samsung Internet, iPhone en iPad.
- Cacheversie bijgewerkt zodat de wijziging direct wordt geladen.

# Changelog

## v2.1.0

- De webapp is omgezet naar een installeerbare PWA.
- Manifest, serviceworker en app-iconen toegevoegd.
- Ondersteuning voor een snelkoppeling op Android, iPhone en iPad.
- Nieuwe uitleg en installatieknop bij Organisator → Beheer.
- De app opent vanaf het beginscherm vrijwel schermvullend.

## v2.0.3

- Nieuwe knop **Aanmeldingen en indeling op nul** voor toekomstige speelavonden.
- De knop verwijdert alle Ja/Misschien/Nee-keuzes, de spelersselectie en beide indelingsrondes.
- Datum, banen en speelavondinstellingen blijven behouden.
- Extra bevestiging voorkomt dat een speelavond per ongeluk wordt leeggemaakt.
- Alleen toekomstige, bewerkbare speelavonden kunnen worden gereset.

## v2.0.2

- Speelavonden die voorbij zijn, staan vanaf dinsdag 21:00 alleen nog in het archief.
- Het archief heeft nu een eigen scherm en toont oude deelnemers, banen en indelingen.
- Archiefavonden zijn standaard vergrendeld en niet per ongeluk te wijzigen.
- De organisator kan een archiefavond tijdelijk ontgrendelen, corrigeren en opnieuw vergrendelen.
- Een ontgrendelde archiefavond verschijnt tijdelijk bij Speelavond en Indeling.

## v2.0.1

- Opgelost: een datum die als **Geen Supertie-speeldag** is ingesteld, verdwijnt nu ook uit de keuzelijsten bij Speelavond, Indeling en WhatsApp.
- Nieuwe instelling **Standaardbanen** toegevoegd.
- Banen 5, 6, 9 en 10 staan standaard geselecteerd.
- Met één knop worden de standaardbanen opgeslagen en toegepast op de komende twee speelavonden.
- Nieuwe speelavonden gebruiken voortaan automatisch de ingestelde standaardbanen.

## v2.0.0

- Vier soorten lidmaatschap toegevoegd.
- Geen Supertie-speeldagen toegevoegd.
- Speelstatistieken en waarschuwingen bij handmatig indelen toegevoegd.
- Slimme automatische indeling met historische puntenscore toegevoegd.
- Indelingskwaliteit van 0 tot 100 en instelbare wegingen toegevoegd.
