import React, {useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {readLucyEvidence, type LucyEvidence} from '../utils/lucyEvidence';

const copy = {
  en: {sources: 'Sources', records: 'Records retrieved for this result.', incomplete: 'Source evidence is incomplete. Some records may be missing.', show: 'Show sources', hide: 'Hide sources', retrieved: 'Retrieved', date: 'Record date', document: 'Document', task: 'Task', project: 'Project', schedule: 'Schedule'},
  es: {sources: 'Fuentes', records: 'Registros consultados para este resultado.', incomplete: 'Las fuentes están incompletas. Pueden faltar algunos registros.', show: 'Mostrar fuentes', hide: 'Ocultar fuentes', retrieved: 'Consultado', date: 'Fecha del registro', document: 'Documento', task: 'Tarea', project: 'Proyecto', schedule: 'Horario'},
  fr: {sources: 'Sources', records: 'Données consultées pour ce résultat.', incomplete: 'Les sources sont incomplètes. Certaines données peuvent manquer.', show: 'Afficher les sources', hide: 'Masquer les sources', retrieved: 'Consulté', date: 'Date de l’enregistrement', document: 'Document', task: 'Tâche', project: 'Projet', schedule: 'Planning'},
};

export default function LucySourceEvidence({evidence, language = 'en'}: {evidence?: LucyEvidence | null; language?: string}) {
  const [expanded, setExpanded] = useState(false);
  const locale = language === 'es' || language === 'fr' ? language : 'en';
  const label = copy[locale];
  const result = readLucyEvidence(evidence);
  if (!result || (!result.sources.length && !result.incomplete)) return null;

  return <View style={styles.panel}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${label.sources} (${result.sources.length})`} accessibilityHint={expanded ? label.hide : label.show} accessibilityState={{expanded}} onPress={() => setExpanded(value => !value)} style={styles.toggle}>
      <Text style={styles.heading}>{label.sources} ({result.sources.length})</Text>
      <Text accessible={false} style={styles.indicator}>{expanded ? '−' : '+'}</Text>
    </TouchableOpacity>
    {result.incomplete && <Text style={styles.warning}>{label.incomplete}</Text>}
    {expanded && <View>
      <Text style={styles.meta}>{label.records}</Text>
      {result.sources.map((source, index) => <View key={`${source.kind}-${source.id}-${index}`} style={styles.source}>
        <Text selectable style={styles.title}>{source.title}</Text>
        <Text selectable style={styles.meta}>{label[source.kind]} · ID: {source.id}</Text>
        <Text selectable style={styles.excerpt}>{source.excerpt}</Text>
        {source.date ? <Text selectable style={styles.meta}>{label.date}: {source.date}</Text> : null}
        <Text style={styles.meta}>{label.retrieved}: {new Date(source.retrievedAt).toLocaleString(locale, {timeZoneName: 'short'})}</Text>
      </View>)}
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  panel: {backgroundColor: '#0D1B27', borderWidth: 1, borderColor: '#21445A', borderRadius: 12, paddingHorizontal: 12, marginVertical: 8},
  toggle: {minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8},
  heading: {color: '#67E8F9', fontSize: 16, fontWeight: '600', flexShrink: 1},
  indicator: {color: '#67E8F9', fontSize: 22},
  warning: {color: '#FDE68A', fontSize: 14, lineHeight: 21, marginBottom: 10},
  source: {borderTopWidth: 1, borderTopColor: '#21445A', paddingVertical: 10, marginTop: 8},
  title: {color: '#EAF5FA', fontSize: 15, fontWeight: '600'},
  meta: {color: '#CBD5E1', fontSize: 13, lineHeight: 20},
  excerpt: {color: '#EAF5FA', fontSize: 14, lineHeight: 21, marginVertical: 4},
});
