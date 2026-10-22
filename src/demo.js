export const DEMO_NAME = 'Wayfarer';
export const DEMO_FILENAME = 'Wayfarer.xcstrings';

const locales = ['en', 'nb', 'es', 'fr', 'ja'];

// A fictional travel app, with a handful of deliberately unfinished translations.
const messages = [
  ['brand.name', 'Wayfarer', 'Wayfarer', 'Wayfarer', 'Wayfarer', 'Wayfarer'],
  ['welcome.title', 'Your next chapter starts here', 'Ditt neste kapittel starter her', 'Tu próxima aventura empieza aquí', 'Votre prochaine aventure commence ici', '次の旅はここから'],
  ['welcome.body', 'Keep every journey close', 'Ha alle reisene dine for hånden', 'Lleva tus viajes contigo', 'Gardez vos voyages à portée de main', 'すべての旅を、いつもそばに'],
  ['action.continue', 'Continue', 'Fortsett', 'Continuar', 'Continuer', '続ける'],
  ['action.plan_trip', 'Plan a trip', 'Planlegg en reise', 'Planear un viaje', 'Préparer un voyage', null],
  ['action.add_stop', 'Add a stop', 'Legg til et stopp', 'Añadir una parada', 'Ajouter une étape', '立ち寄り先を追加'],
  ['action.save_trip', 'Save trip', 'Lagre reisen', 'Guardar viaje', 'Enregistrer le voyage', '旅行を保存'],
  ['action.share', 'Share itinerary', 'Del reiseplanen', '', 'Partager l’itinéraire', '旅程を共有'],
  ['action.cancel', 'Cancel', 'Avbryt', 'Cancelar', 'Annuler', 'キャンセル'],
  ['trips.title', 'Your trips', 'Dine reiser', 'Tus viajes', 'Vos voyages', 'あなたの旅行'],
  ['saved.title', 'Saved places', 'Lagrede steder', 'Lugares guardados', null, '保存した場所'],
  ['trip.dates', 'Travel dates', 'Reisedatoer', 'Fechas del viaje', 'Dates du voyage', '旅行の日程'],
  ['trip.destination', 'Destination', 'Reisemål', 'Destino', 'Destination', '目的地'],
  ['trip.travelers', 'Travelers', 'Reisende', 'Viajeros', 'Voyageurs', '旅行者'],
  ['trip.departure', 'Departs %@', 'Avreise %@', 'Sale %@', 'Départ prévu', '出発 %@'],
  ['trip.arrival', 'Arrives %@', 'Ankomst %@', 'Llega %d', 'Arrivée %@', '到着 %@'],
  ['trip.confirmed', 'You’re going to %@', 'Du skal til %@', 'Te vas a %@', 'Vous partez pour %@', '%@への旅が決まりました'],
  ['offline.title', 'Ready, even offline', 'Klar, også uten nett', 'Todo listo, incluso sin conexión', 'Prêt, même hors ligne', 'オフラインでも安心'],
  ['offline.body', 'Download your itinerary before you go.', 'Last ned reiseplanen før du drar.', 'Descarga tu itinerario antes de salir.', 'Téléchargez votre itinéraire avant de partir.', '出発前に旅程をダウンロードしましょう。'],
  ['empty.title', 'A little adventure awaits', 'Et lite eventyr venter', 'Te espera una pequeña aventura', 'Une petite aventure vous attend', '小さな冒険が待っています'],
  ['empty.body', 'Add your first trip to get started.', 'Legg til din første reise for å komme i gang.', 'Añade tu primer viaje para empezar.', 'Ajoutez votre premier voyage pour commencer.  ', '最初の旅行を追加しましょう。'],
  ['notification.reminder', 'Your trip to %@ starts tomorrow.', 'Reisen din til %@ starter i morgen.', 'Tu viaje a %@ empieza mañana.', 'Votre voyage à %@ commence demain.', '明日から%@への旅が始まります。'],
];

const strings = Object.fromEntries(messages.map(([key, ...values]) => [key, {
  extractionState: 'manual',
  localizations: Object.fromEntries(locales.flatMap((locale, index) => (
    values[index] === null ? [] : [[locale, { stringUnit: { state: 'translated', value: values[index] } }]]
  ))),
}]));

strings['brand.name'].comment = 'App name. Keep Wayfarer unchanged in every language.';
strings['action.add_stop'].localizations.nb.stringUnit.state = 'needs_review';
strings['trip.departure'].comment = '%@ is a formatted departure time, for example 09:45.';
strings['trip.arrival'].comment = '%@ is a formatted arrival time, for example 14:20.';

const pluralValues = {
  en: { one: '%lld saved place', other: '%lld saved places' },
  nb: { one: '%lld lagret sted', other: '%lld lagrede steder' },
  es: { one: '%lld lugar guardado', many: '%lld lugares guardados', other: '%lld lugares guardados' },
  fr: { one: '%lld lieu enregistré', many: '%lld lieux enregistrés', other: '%lld lieux enregistrés' },
  ja: { other: '保存した場所 %lld 件' },
};

strings['places.count'] = {
  comment: 'Number of places saved by the traveler. Varies by plural category.',
  localizations: Object.fromEntries(Object.entries(pluralValues).map(([locale, values]) => [locale, {
    variations: {
      plural: Object.fromEntries(Object.entries(values).map(([category, value]) => [category, {
        stringUnit: { state: 'translated', value },
      }])),
    },
  }])),
};

strings['debug.preview_label'] = {
  comment: 'Internal preview identifier. Intentionally excluded from translation.',
  shouldTranslate: false,
  localizations: { en: { stringUnit: { state: 'translated', value: 'WAYFARER_PREVIEW' } } },
};

export const DEMO_FILES = [{
  name: DEMO_FILENAME,
  text: JSON.stringify({ sourceLanguage: 'en', strings, version: '1.0' }, null, 2),
}];
