// English source copy is the key; route names and user content are never translated.
export const screenCopy: Record<string, [string, string]> = {
  "Unavailable": ["No disponible", "Indisponible"],
  "Today": ["Hoy", "Aujourd’hui"],
  "First name": ["Nombre", "Prénom"],
  "Last name": ["Apellido", "Nom de famille"],
  "Email": ["Correo electrónico", "Courriel"],
  "Role": ["Rol", "Rôle"],
  "employee": ["empleado", "employé"],
  "manager": ["responsable", "responsable"],
  "owner": ["propietario", "propriétaire"],
  "boss": ["propietario", "propriétaire"],
  "admin": ["administrador", "administrateur"],
  "Company administration": ["Administración de la empresa", "Administration de l’entreprise"],
  "Administration account could not be verified.": ["No se pudo verificar la cuenta de administración.", "Impossible de vérifier le compte d’administration."],
  "Reconnect before changing company administration.": ["Vuelve a conectarte antes de cambiar la administración.", "Reconnectez-vous avant de modifier l’administration."],
  "Save employee changes?": ["¿Guardar cambios del empleado?", "Enregistrer les modifications de l’employé ?"],
  "This changes the selected employee account. No email or payment is sent.": ["Esto cambia la cuenta del empleado seleccionado. No envía correos ni pagos.", "Ceci modifie le compte de l’employé sélectionné. Aucun courriel ni paiement n’est envoyé."],
  "Employee changes saved. Refresh active sessions when roles or passwords change.": ["Cambios guardados. Actualiza las sesiones activas si cambian roles o contraseñas.", "Modifications enregistrées. Actualisez les sessions actives après un changement de rôle ou de mot de passe."],
  "Protected owners and administrators use dedicated account and ownership workflows. Managers cannot edit peers or promote employees. Changes are audited; payouts remain disabled.": ["Los propietarios y administradores protegidos usan flujos específicos. Los responsables no pueden editar a sus pares ni ascender empleados. Los cambios quedan auditados; los pagos siguen desactivados.", "Les propriétaires et administrateurs protégés utilisent des procédures dédiées. Les responsables ne peuvent modifier leurs pairs ni promouvoir les employés. Les changements sont audités ; les versements restent désactivés."],
  "Refresh administration": ["Actualizar administración", "Actualiser l’administration"],
  "Active projects": ["Proyectos activos", "Projets actifs"],
  "Recorded payroll (currency unspecified)": ["Nómina registrada (moneda sin especificar)", "Paie enregistrée (devise non précisée)"],
  "Recorded labour today (currency unspecified)": ["Coste laboral registrado hoy (moneda sin especificar)", "Coût de main-d’œuvre enregistré aujourd’hui (devise non précisée)"],
  "Margin requires currency and cost reconciliation. Recorded payments are not verified bank settlement.": ["El margen requiere conciliar monedas y costes. Los pagos registrados no son liquidaciones bancarias verificadas.", "La marge nécessite un rapprochement des devises et coûts. Les paiements enregistrés ne sont pas des règlements bancaires vérifiés."],
  "Payment totals are unavailable.": ["Los totales de pagos no están disponibles.", "Les totaux des paiements sont indisponibles."],
  "Recorded payments this month": ["Pagos registrados este mes", "Paiements enregistrés ce mois-ci"],
  "Team invitations": ["Invitaciones al equipo", "Invitations de l’équipe"],
  "Payout status": ["Estado de pagos", "État des versements"],
  "Search employees": ["Buscar empleados", "Rechercher des employés"],
  "Current hourly rate": ["Tarifa horaria actual", "Taux horaire actuel"],
  "Tax identifier": ["Identificador fiscal", "Identifiant fiscal"],
  "Manage employee": ["Gestionar empleado", "Gérer l’employé"],
  "Compensation": ["Remuneración", "Rémunération"],
  "Tax information": ["Información fiscal", "Informations fiscales"],
  "Employee role": ["Rol de empleado", "Rôle employé"],
  "Manager role": ["Rol de responsable", "Rôle responsable"],
  "Active account": ["Cuenta activa", "Compte actif"],
  "New effective rates do not rewrite finalized payroll.": ["Las nuevas tarifas no cambian nóminas finalizadas.", "Les nouveaux taux ne modifient pas les paies finalisées."],
  "Hourly rate": ["Tarifa horaria", "Taux horaire"],
  "Only masked tax identifiers are returned. Blank fields preserve existing values. Format checks do not certify tax identity.": ["Solo se muestran identificadores fiscales enmascarados. Los campos vacíos conservan sus valores. Verificar el formato no certifica la identidad fiscal.", "Seuls les identifiants fiscaux masqués sont affichés. Les champs vides conservent les valeurs. Le contrôle du format ne certifie pas l’identité fiscale."],
  "New SIN (optional)": ["Nuevo NAS/SIN (opcional)", "Nouveau NAS (facultatif)"],
  "Date of birth (YYYY-MM-DD)": ["Fecha de nacimiento (AAAA-MM-DD)", "Date de naissance (AAAA-MM-JJ)"],
  "Use at least 12 characters and at most 72 UTF-8 bytes. Share credentials securely; the employee must change this password on sign-in.": ["Usa al menos 12 caracteres y como máximo 72 bytes UTF-8. Comparte las credenciales de forma segura; el empleado debe cambiar la contraseña al iniciar sesión.", "Utilisez au moins 12 caractères et au plus 72 octets UTF-8. Partagez les identifiants de façon sûre ; l’employé doit changer le mot de passe à la connexion."],
  "Temporary password": ["Contraseña temporal", "Mot de passe temporaire"],
  "Save employee changes": ["Guardar cambios del empleado", "Enregistrer les modifications"],
  "Close employee editor": ["Cerrar editor de empleado", "Fermer l’éditeur de l’employé"],
  "Read administration audit": ["Ver auditoría administrativa", "Consulter l’audit administratif"],
  "Administration audit": ["Auditoría administrativa", "Audit administratif"],
  "Administration event": ["Evento administrativo", "Événement administratif"],
  "Employee ID": ["ID de empleado", "ID de l’employé"],
  "No administration events on this page.": ["No hay eventos administrativos en esta página.", "Aucun événement administratif sur cette page."],
  "Profile updated": ["Perfil actualizado", "Profil mis à jour"],
  "Compensation updated": ["Remuneración actualizada", "Rémunération mise à jour"],
  "Tax information updated": ["Información fiscal actualizada", "Informations fiscales mises à jour"],
  "Temporary password reset": ["Contraseña temporal restablecida", "Mot de passe temporaire réinitialisé"],
  "Role updated": ["Rol actualizado", "Rôle mis à jour"],
  "Employee deactivated": ["Empleado desactivado", "Employé désactivé"],
  "Ownership transferred": ["Propiedad transferida", "Propriété transférée"],
  "Employee invited": ["Empleado invitado", "Employé invité"],
  "Loading…": ["Cargando…", "Chargement…"],
  "Sign in again before exporting.": ["Vuelve a iniciar sesión antes de exportar.", "Reconnectez-vous avant d’exporter."],
  "Evidence center": ["Centro de evidencias", "Centre de preuves"],
  "Evidence account could not be verified.": ["No se pudo verificar la cuenta de evidencias.", "Impossible de vérifier le compte des preuves."],
  "Reconnect before reviewing or exporting evidence.": ["Vuelve a conectarte antes de revisar o exportar evidencias.", "Reconnectez-vous avant de consulter ou d’exporter des preuves."],
  "Evidence action failed.": ["La acción de evidencia falló.", "L’action sur les preuves a échoué."],
  "Packages summarize stored records. Hashes do not independently prove camera, location or event authenticity. Raw time and GPS metadata are included in every package.": ["Los paquetes resumen registros guardados. Los hashes no prueban de forma independiente la autenticidad de la cámara, ubicación o evento. Cada paquete incluye metadatos originales de horas y GPS.", "Les dossiers résument les données enregistrées. Les empreintes ne prouvent pas indépendamment l’authenticité de la caméra, du lieu ou de l’événement. Chaque dossier contient les métadonnées de temps et GPS."],
  "Refresh evidence": ["Actualizar evidencias", "Actualiser les preuves"],
  "Return to evidence list": ["Volver a las evidencias", "Retour à la liste des preuves"],
  "Share time-entry PDF": ["Compartir registro horario PDF", "Partager le relevé horaire PDF"],
  "Share GPS reconstruction": ["Compartir reconstrucción GPS", "Partager la reconstitution GPS"],
  "Package contents": ["Contenido del paquete", "Contenu du dossier"],
  "Select original files explicitly. Missing originals stop generation. Mobile packages are limited to 20 MB; use the web for larger packages.": ["Selecciona los originales explícitamente. Si falta alguno, la generación se detiene. El límite móvil es 20 MB; usa la web para paquetes mayores.", "Sélectionnez explicitement les originaux. Un original manquant interrompt la génération. Limite mobile : 20 Mo ; utilisez le web pour les dossiers plus volumineux."],
  "Include time-entry PDF": ["Incluir registro horario PDF", "Inclure le relevé horaire PDF"],
  "Include GPS reconstruction": ["Incluir reconstrucción GPS", "Inclure la reconstitution GPS"],
  "Include selected voice reconstructions": ["Incluir reconstrucciones de voz seleccionadas", "Inclure les reconstitutions vocales sélectionnées"],
  "Photos and videos": ["Fotos y vídeos", "Photos et vidéos"],
  "No files in this category.": ["No hay archivos en esta categoría.", "Aucun fichier dans cette catégorie."],
  "Include original": ["Incluir original", "Inclure l’original"],
  "Original file is missing.": ["Falta el archivo original.", "Le fichier original est manquant."],
  "Share voice reconstruction": ["Compartir reconstrucción de voz", "Partager la reconstitution vocale"],
  "Generate and share ZIP": ["Generar y compartir ZIP", "Générer et partager le ZIP"],
  "Provided ZIP SHA-256": ["SHA-256 del ZIP proporcionado", "SHA-256 du ZIP fourni"],
  "Choose a valid evidence record.": ["Elige un registro de evidencia válido.", "Choisissez un enregistrement de preuve valide."],
  "Evidence could not be downloaded.": ["No se pudo descargar la evidencia.", "Impossible de télécharger la preuve."],
  "Evidence package could not be verified.": ["No se pudo verificar el paquete de evidencias.", "Impossible de vérifier le dossier de preuves."],
  "Evidence package could not be saved.": ["No se pudo guardar el paquete de evidencias.", "Impossible d’enregistrer le dossier de preuves."],
  "Unsupported attachment": ["Archivo adjunto no compatible", "Pièce jointe non prise en charge"],
  "Sign in to view this file": ["Inicia sesión para ver este archivo", "Connectez-vous pour consulter ce fichier"],
  "This attachment could not be downloaded. Please retry.": ["No se pudo descargar este archivo. Reintenta.", "Impossible de télécharger cette pièce jointe. Réessayez."],
  "The server did not return a media file": ["El servidor no devolvió un archivo multimedia", "Le serveur n’a pas renvoyé de fichier multimédia"],
  "Sharing is unavailable on this device.": ["No se puede compartir en este dispositivo.", "Le partage est indisponible sur cet appareil."],
  "View {name}": ["Ver {name}", "Voir {name}"],
  "{type}: {name}": ["{type}: {name}", "{type} : {name}"],
  "{elapsed} / {duration} seconds": ["{elapsed} / {duration} segundos", "{elapsed} / {duration} secondes"],
  "Tap to view or play": ["Pulsa para ver o reproducir", "Appuyez pour afficher ou lire"],
  "Close viewer": ["Cerrar visor", "Fermer la visionneuse"],
  "Use Open or save to view this document in a compatible app.": ["Usa Abrir o guardar para ver este documento en una aplicación compatible.", "Utilisez Ouvrir ou enregistrer pour consulter ce document dans une application compatible."],
  "Open or save": ["Abrir o guardar", "Ouvrir ou enregistrer"],
  "Pause": ["Pausar", "Pause"],
  "Play": ["Reproducir", "Lire"],
  "Photo": ["Foto", "Photo"],
  "Video": ["Vídeo", "Vidéo"],
  "Audio": ["Audio", "Audio"],
  "Document": ["Documento", "Document"],
  "Accounting integrations": ["Integraciones contables", "Intégrations comptables"],
  "Integration account could not be verified.": ["No se pudo verificar la cuenta de integración.", "Impossible de vérifier le compte d’intégration."],
  "Reconnect before changing integrations.": ["Vuelve a conectarte antes de cambiar las integraciones.", "Reconnectez-vous avant de modifier les intégrations."],
  "Complete authorization in the browser, return here and refresh connections.": ["Completa la autorización en el navegador, vuelve aquí y actualiza las conexiones.", "Terminez l’autorisation dans le navigateur, revenez ici et actualisez les connexions."],
  "Disconnect integration?": ["¿Desconectar la integración?", "Déconnecter l’intégration ?"],
  "This revokes the selected company connection. Existing financial records are retained.": ["Esto revoca la conexión seleccionada de la empresa. Los registros financieros se conservan.", "Ceci révoque la connexion sélectionnée de l’entreprise. Les données financières sont conservées."],
  "Connection removed.": ["Conexión eliminada.", "Connexion supprimée."],
  "These are company accounting connections. They do not enable employee payouts or change your software subscription.": ["Estas son conexiones contables de la empresa. No activan pagos al personal ni cambian tu suscripción al software.", "Ce sont les connexions comptables de l’entreprise. Elles n’activent pas les versements aux employés et ne modifient pas votre abonnement au logiciel."],
  "Refresh connections": ["Actualizar conexiones", "Actualiser les connexions"],
  "Connected": ["Conectado", "Connecté"],
  "Reconnect required": ["Se requiere reconectar", "Reconnexion requise"],
  "Not connected": ["No conectado", "Non connecté"],
  "Environment": ["Entorno", "Environnement"],
  "Not configured": ["Sin configurar", "Non configuré"],
  "Account ID": ["ID de cuenta", "ID du compte"],
  "Connect Stripe": ["Conectar Stripe", "Connecter Stripe"],
  "Connect QuickBooks": ["Conectar QuickBooks", "Connecter QuickBooks"],
  "Disconnect Stripe": ["Desconectar Stripe", "Déconnecter Stripe"],
  "Disconnect QuickBooks": ["Desconectar QuickBooks", "Déconnecter QuickBooks"],
  "Inspect QuickBooks company": ["Ver empresa de QuickBooks", "Consulter l’entreprise QuickBooks"],
  "List QuickBooks items": ["Listar artículos de QuickBooks", "Lister les articles QuickBooks"],
  "Accounting synchronization needs separate reconciliation review. Connecting an account does not verify settlement or activate automatic synchronization.": ["La sincronización contable necesita una revisión de conciliación separada. Conectar una cuenta no verifica liquidaciones ni activa sincronización automática.", "La synchronisation comptable nécessite un contrôle de rapprochement distinct. Connecter un compte ne vérifie pas les règlements et n’active pas de synchronisation automatique."],
  "Authorization link could not be verified.": ["No se pudo verificar el enlace de autorización.", "Impossible de vérifier le lien d’autorisation."],
  "Regular hours": ["Horas ordinarias", "Heures normales"],
  "Overtime hours": ["Horas extra", "Heures supplémentaires"],
  "Voice notes": ["Notas de voz", "Notes vocales"],
  "Company timezone": ["Zona horaria de la empresa", "Fuseau horaire de l’entreprise"],

  "Reports & exports": ["Informes y exportaciones", "Rapports et exports"],
  "Report account could not be verified.": ["No se pudo verificar la cuenta del informe.", "Impossible de vérifier le compte du rapport."],
  "Reconnect before loading or exporting reports.": ["Vuelve a conectarte para cargar o exportar informes.", "Reconnectez-vous pour charger ou exporter des rapports."],
  "Report action failed.": ["La acción del informe falló.", "L’action sur le rapport a échoué."],
  "Recorded time-entry amounts have no stored currency. This is an operational report, not a reviewed payroll or payment statement.": ["Los importes de horas registradas no tienen moneda guardada. Este informe operativo no es una nómina revisada ni un estado de pagos.", "Les montants des heures n’ont pas de devise enregistrée. Ce rapport opérationnel n’est ni une paie validée ni un relevé de paiements."],
  "Refresh projects": ["Actualizar proyectos", "Actualiser les projets"],
  "Showing the first 200 projects. Enter another company project ID below.": ["Se muestran los primeros 200 proyectos. Introduce otro ID de proyecto de la empresa abajo.", "Les 200 premiers projets sont affichés. Saisissez un autre ID de projet de l’entreprise ci-dessous."],
  "Project ID": ["ID de proyecto", "ID du projet"],
  "Start date (YYYY-MM-DD)": ["Fecha inicial (AAAA-MM-DD)", "Date de début (AAAA-MM-JJ)"],
  "End date (YYYY-MM-DD)": ["Fecha final (AAAA-MM-DD)", "Date de fin (AAAA-MM-JJ)"],
  "Generate summary": ["Generar resumen", "Générer le résumé"],
  "Report selection changed. Refresh before exporting.": ["La selección cambió. Actualiza antes de exportar.", "La sélection a changé. Actualisez avant d’exporter."],
  "Share report PDF": ["Compartir informe PDF", "Partager le rapport PDF"],
  "Share timesheet CSV": ["Compartir horas en CSV", "Partager les heures en CSV"],
  "Workforce records": ["Registros del personal", "Données du personnel"],
  "No workforce records in this reporting range.": ["No hay registros del personal en este período.", "Aucune donnée du personnel sur cette période."],
  "Elapsed hours": ["Horas transcurridas", "Heures écoulées"],
  "Recorded wages (currency unspecified)": ["Salarios registrados (moneda sin especificar)", "Salaires enregistrés (devise non précisée)"],
  "Time entries": ["Registros de horas", "Entrées de temps"],
  "Completed entries": ["Registros completados", "Entrées terminées"],
  "Approved completed entries": ["Registros completados y aprobados", "Entrées terminées approuvées"],
  "Media files": ["Archivos multimedia", "Fichiers multimédias"],
  "Marked media": ["Multimedia marcado", "Médias marqués"],
  "Scored photos": ["Fotos evaluadas", "Photos évaluées"],
  "Average photo score": ["Puntuación media de fotos", "Score moyen des photos"],
  "Photos scoring at least 70": ["Fotos con puntuación de 70 o más", "Photos notées au moins 70"],
  "GPS observations": ["Observaciones GPS", "Observations GPS"],
  "Attachments": ["Archivos adjuntos", "Pièces jointes"],
  "Anomalous entries": ["Registros anómalos", "Entrées anormales"],
  "Recorded payroll hours": ["Horas de nómina registradas", "Heures de paie enregistrées"],
  "Elapsed / payroll hours variance": ["Diferencia entre horas transcurridas y de nómina", "Écart heures écoulées / heures de paie"],
  "Completion rate (%)": ["Tasa de finalización (%)", "Taux de complétion (%)"],
  "Approval rate (%)": ["Tasa de aprobación (%)", "Taux d’approbation (%)"],
  "Report readiness (%)": ["Preparación del informe (%)", "État de préparation du rapport (%)"],
  "Choose a project": ["Elige un proyecto", "Choisissez un projet"],
  "Choose valid reporting dates.": ["Elige fechas válidas para el informe.", "Choisissez des dates valides pour le rapport."],
  "Choose a reporting range of at most 367 calendar days.": ["Elige un período de hasta 367 días naturales.", "Choisissez une période de 367 jours civils maximum."],
  "Report format is unavailable.": ["El formato del informe no está disponible.", "Le format du rapport est indisponible."],
  "Report could not be downloaded.": ["No se pudo descargar el informe.", "Impossible de télécharger le rapport."],
  "Manager access required": ["Se requiere acceso de responsable", "Accès responsable requis"],
  "Previous": ["Anterior", "Précédent"],
  "Next": ["Siguiente", "Suivant"],
  "Client": ["Cliente", "Client"],

  "Invoices & estimates": ["Facturas y presupuestos", "Factures et devis"],
  "Invoices": ["Facturas", "Factures"],
  "Estimates": ["Presupuestos", "Devis"],
  "Document account could not be verified.": ["No se pudo verificar la cuenta del documento.", "Impossible de vérifier le compte du document."],
  "Reconnect before changing financial records.": ["Vuelve a conectarte antes de cambiar registros financieros.", "Reconnectez-vous avant de modifier les données financières."],
  "Document action failed.": ["La acción del documento falló.", "L’action sur le document a échoué."],
  "Only drafts can be edited.": ["Solo se pueden editar borradores.", "Seuls les brouillons peuvent être modifiés."],
  "Record saved. No email or money transfer was sent.": ["Registro guardado. No se envió correo ni transferencia.", "Enregistrement effectué. Aucun courriel ni virement envoyé."],
  "Unspecified currency": ["Moneda sin especificar", "Devise non précisée"],
  "This records an external event. No email or money transfer is sent.": ["Esto registra un evento externo. No envía correos ni transferencias.", "Ceci enregistre un événement externe. Aucun courriel ni virement n’est envoyé."],
  "Share PDFs externally. Record customer acceptance and completed payments with their references. Automatic email, recurring generation and bank settlement are unavailable.": ["Comparte los PDF externamente. Registra la aceptación y los pagos completados con sus referencias. El correo automático, la generación recurrente y la liquidación bancaria no están disponibles.", "Partagez les PDF à l’extérieur. Enregistrez l’acceptation du client et les paiements effectués avec leurs références. L’envoi automatique, la génération récurrente et le règlement bancaire sont indisponibles."],
  "No client": ["Sin cliente", "Aucun client"],
  "Balance": ["Saldo", "Solde"],
  "Issue date": ["Fecha de emisión", "Date d’émission"],
  "New draft": ["Nuevo borrador", "Nouveau brouillon"],
  "Share PDF": ["Compartir PDF", "Partager le PDF"],
  "Edit draft": ["Editar borrador", "Modifier le brouillon"],
  "Record external sharing": ["Registrar envío externo", "Enregistrer le partage externe"],
  "Acceptance reference": ["Referencia de aceptación", "Référence d’acceptation"],
  "Record acceptance": ["Registrar aceptación", "Enregistrer l’acceptation"],
  "Invoice due date (YYYY-MM-DD)": ["Vencimiento de factura (AAAA-MM-DD)", "Échéance de facture (AAAA-MM-JJ)"],
  "Convert to invoice": ["Convertir a factura", "Convertir en facture"],
  "Payment amount": ["Importe pagado", "Montant du paiement"],
  "Payment date (YYYY-MM-DD)": ["Fecha de pago (AAAA-MM-DD)", "Date du paiement (AAAA-MM-JJ)"],
  "Receipt reference": ["Referencia del recibo", "Référence du reçu"],
  "Record completed payment": ["Registrar pago completado", "Enregistrer le paiement effectué"],
  "Client summary": ["Resumen del cliente", "Résumé du client"],
  "Billed": ["Facturado", "Facturé"],
  "Recorded paid": ["Pago registrado", "Paiement enregistré"],
  "Issue date (YYYY-MM-DD)": ["Fecha de emisión (AAAA-MM-DD)", "Date d’émission (AAAA-MM-JJ)"],
  "Due date (YYYY-MM-DD)": ["Vencimiento (AAAA-MM-DD)", "Échéance (AAAA-MM-JJ)"],
  "Expiry date (YYYY-MM-DD)": ["Caducidad (AAAA-MM-DD)", "Expiration (AAAA-MM-JJ)"],
  "Tax rate (%)": ["Impuesto (%)", "Taux de taxe (%)"],
  "Line": ["Línea", "Ligne"],
  "Unit price": ["Precio unitario", "Prix unitaire"],
  "Quantity": ["Cantidad", "Quantité"],
  "Description": ["Descripción", "Description"],
  "Linked approved time entries": ["Horas aprobadas vinculadas", "Heures approuvées liées"],
  "Remove line": ["Eliminar línea", "Supprimer la ligne"],
  "Add line": ["Añadir línea", "Ajouter une ligne"],
  "Load unbilled entries": ["Cargar horas sin facturar", "Charger les heures non facturées"],
  "Internal notes": ["Notas internas", "Notes internes"],
  "Customer notes": ["Notas para el cliente", "Notes au client"],
  "Disable recurrence metadata": ["Desactivar metadatos recurrentes", "Désactiver les métadonnées de récurrence"],
  "Add recurrence metadata": ["Añadir metadatos recurrentes", "Ajouter les métadonnées de récurrence"],
  "Recurrence interval": ["Intervalo recurrente", "Intervalle de récurrence"],
  "Recurrence end (YYYY-MM-DD)": ["Fin de recurrencia (AAAA-MM-DD)", "Fin de récurrence (AAAA-MM-JJ)"],
  "Milestone name": ["Nombre del hito", "Nom du jalon"],
  "Milestone percentage": ["Porcentaje del hito", "Pourcentage du jalon"],
  "Parent invoice ID (optional)": ["ID de factura principal (opcional)", "ID de facture parente (facultatif)"],
  "Totals are calculated and validated by the server when saved.": ["El servidor calcula y valida los totales al guardar.", "Le serveur calcule et valide les totaux à l’enregistrement."],
  "Save draft": ["Guardar borrador", "Enregistrer le brouillon"],
  "All statuses": ["Todos los estados", "Tous les états"],
  "Response uncertain. Refresh and inspect records before retrying.": ["Respuesta incierta. Actualiza y revisa los registros antes de reintentar.", "Réponse incertaine. Actualisez et vérifiez les enregistrements avant de réessayer."],
  "draft": ["borrador", "brouillon"],
  "sent": ["compartido externamente", "partagé à l’extérieur"],
  "partial": ["pago parcial", "partiellement payé"],
  "paid": ["pagado", "payé"],
  "accepted": ["aceptado", "accepté"],
  "converted": ["convertido", "converti"],
  "overdue": ["vencido", "en retard"],
  "viewed": ["visto", "consulté"],
  "cancelled": ["cancelado", "annulé"],
  'Start a new draft?': ['¿Iniciar un nuevo borrador?', 'Commencer un nouveau brouillon ?'],
  'Start new draft': ['Iniciar nuevo borrador', 'Nouveau brouillon'],
  'This removes the saved expense draft on this device.': ['Esto elimina el borrador del gasto guardado en este dispositivo.', 'Cela supprime le brouillon de dépense enregistré sur cet appareil.'],
  "Expenses & receipts": ["Gastos y recibos", "Dépenses et reçus"],
  "Approval does not send a payment.": ["La aprobación no envía un pago.", "L’approbation ne déclenche pas de paiement."],
  "Expenses could not be loaded.": ["No se pudieron cargar los gastos.", "Impossible de charger les dépenses."],
  "Expense draft could not be saved on this device.": ["No se pudo guardar el borrador en este dispositivo.", "Impossible d’enregistrer le brouillon sur cet appareil."],
  "Expense draft could not be loaded.": ["No se pudo cargar el borrador del gasto.", "Impossible de charger le brouillon de dépense."],
  "Reconnect to submit or review. Your draft is kept.": ["Vuelve a conectarte para enviar o revisar. Tu borrador se conserva.", "Reconnectez-vous pour soumettre ou examiner. Votre brouillon est conservé."],
  "Expense action failed.": ["No se pudo completar la acción del gasto.", "L’action sur la dépense a échoué."],
  "Choose a receipt under 100 MB.": ["Elige un recibo de menos de 100 MB.", "Choisissez un reçu de moins de 100 Mo."],
  "Expense submitted for review.": ["Gasto enviado para revisión.", "Dépense soumise pour examen."],
  "Choose a PNG, JPEG or WebP image under 1 MB for extraction.": ["Elige una imagen PNG, JPEG o WebP de menos de 1 MB para extraer los datos.", "Choisissez une image PNG, JPEG ou WebP de moins de 1 Mo pour l’extraction."],
  "Check every extracted value against your receipt before submitting.": ["Comprueba cada valor extraído con el recibo antes de enviarlo.", "Vérifiez chaque valeur extraite avec votre reçu avant de soumettre."],
  "Receipt link is unavailable.": ["El enlace del recibo no está disponible.", "Le lien du reçu est indisponible."],
  "Receipt could not be opened.": ["No se pudo abrir el recibo.", "Impossible d’ouvrir le reçu."],
  "Vendor": ["Proveedor", "Fournisseur"],
  "Amount": ["Importe", "Montant"],
  "Expense date (YYYY-MM-DD)": ["Fecha del gasto (AAAA-MM-DD)", "Date de dépense (AAAA-MM-JJ)"],
  "Currency": ["Moneda", "Devise"],
  "Notes / business purpose": ["Notas / propósito comercial", "Notes / motif professionnel"],
  "Attach receipt": ["Adjuntar recibo", "Joindre un reçu"],
  "Remove receipt": ["Quitar recibo", "Retirer le reçu"],
  "Extract receipt fields": ["Extraer datos del recibo", "Extraire les champs du reçu"],
  "Working…": ["Procesando…", "Traitement…"],
  "Submit for review": ["Enviar para revisión", "Soumettre pour examen"],
  "Refresh": ["Actualizar", "Actualiser"],
  "Open receipt": ["Abrir recibo", "Ouvrir le reçu"],
  "Approve": ["Aprobar", "Approuver"],
  "Reject": ["Rechazar", "Rejeter"],
  "No expense claims yet.": ["Todavía no hay solicitudes de gastos.", "Aucune demande de remboursement."],
  "pending": ["pendiente", "en attente"],
  "approved": ["aprobado", "approuvé"],
  "rejected": ["rechazado", "rejeté"],
  "Enter a vendor name up to 200 characters.": ["Introduce un proveedor de hasta 200 caracteres.", "Saisissez un fournisseur de 200 caractères maximum."],
  "Enter an amount between 0.01 and 1000000, with up to two decimals.": ["Introduce un importe entre 0,01 y 1000000, con hasta dos decimales.", "Saisissez un montant entre 0,01 et 1000000, avec deux décimales maximum."],
  "Choose CAD or USD.": ["Elige CAD o USD.", "Choisissez CAD ou USD."],
  "Use a valid date in YYYY-MM-DD format.": ["Usa una fecha válida en formato AAAA-MM-DD.", "Utilisez une date valide au format AAAA-MM-JJ."],
  "Keep notes under 4000 characters.": ["Limita las notas a 4000 caracteres.", "Limitez les notes à 4000 caractères."],
  'Edit Name': ['Editar nombre', 'Modifier le nom'],
  'Temperature Unit': ['Unidad de temperatura', 'Unité de température'],
  'Change Password': ['Cambiar contraseña', 'Changer le mot de passe'],
  'Subscription Plans': ['Planes de suscripción', 'Offres d’abonnement'],
  'Privacy Policy': ['Política de privacidad', 'Politique de confidentialité'],
  'Terms of Use': ['Condiciones de uso', 'Conditions d’utilisation'],
  'First Name': ['Nombre', 'Prénom'], 'Last Name': ['Apellido', 'Nom'],
  'Current Password': ['Contraseña actual', 'Mot de passe actuel'],
  'New Password (min 6 chars)': ['Nueva contraseña (mín. 6 caracteres)', 'Nouveau mot de passe (6 caractères min.)'],
  'Confirm New Password': ['Confirmar nueva contraseña', 'Confirmer le nouveau mot de passe'],
  'Cancel': ['Cancelar', 'Annuler'], 'Save': ['Guardar', 'Enregistrer'],
  'Saving...': ['Guardando...', 'Enregistrement...'], 'Changing...': ['Cambiando...', 'Modification...'],
  'Update': ['Actualizar', 'Mettre à jour'], 'Error': ['Error', 'Erreur'], 'Success': ['Éxito', 'Succès'],
  'Profile picture updated': ['Foto de perfil actualizada', 'Photo de profil mise à jour'],
  'Failed to upload profile picture': ['No se pudo subir la foto de perfil', 'Échec de l’envoi de la photo'],
  'First and last name are required': ['El nombre y apellido son obligatorios', 'Le prénom et le nom sont obligatoires'],
  'Name updated': ['Nombre actualizado', 'Nom mis à jour'],
  'Failed to update name': ['No se pudo actualizar el nombre', 'Échec de la mise à jour du nom'],
  'All fields are required': ['Todos los campos son obligatorios', 'Tous les champs sont obligatoires'],
  'Passwords do not match': ['Las contraseñas no coinciden', 'Les mots de passe ne correspondent pas'],
  'Password must be at least 6 characters': ['La contraseña debe tener al menos 6 caracteres', 'Le mot de passe doit contenir au moins 6 caractères'],
  'Password changed successfully': ['Contraseña cambiada correctamente', 'Mot de passe modifié'],
  'Failed to change password': ['No se pudo cambiar la contraseña', 'Échec du changement de mot de passe'],
  'Could not save language': ['No se pudo guardar el idioma', 'Impossible d’enregistrer la langue'],
  'Open profile': ['Abrir perfil', 'Ouvrir le profil'],
  'SHIFT IN PROGRESS': ['TURNO EN CURSO', 'SERVICE EN COURS'],
  'READY FOR THE DAY': ['LISTO PARA EL DÍA', 'PRÊT POUR LA JOURNÉE'],
  'CURRENT SESSION': ['SESIÓN ACTUAL', 'SESSION ACTUELLE'],
  'Work in progress': ['Trabajo en curso', 'Travail en cours'],
  'Time and location evidence are being recorded for this session.': ['Se están registrando pruebas de tiempo y ubicación para esta sesión.', 'Les preuves de temps et de localisation sont enregistrées pour cette session.'],
  'GPS connected': ['GPS conectado', 'GPS connecté'], 'Evidence live': ['Registro en directo', 'Preuves en direct'],
  'Finish shift': ['Finalizar turno', 'Terminer le service'], 'YOUR WORKDAY': ['TU JORNADA', 'VOTRE JOURNÉE'],
  'Everything ready.\nStart with confidence.': ['Todo listo.\nEmpieza con confianza.', 'Tout est prêt.\nCommencez en confiance.'],
  'Choose today’s project or scheduled shift. Future Jobs will connect time, GPS, media, and job context automatically.': ['Elige el proyecto o turno de hoy. Future Jobs conectará automáticamente tiempo, GPS, archivos y contexto del trabajo.', 'Choisissez le projet ou le service du jour. Future Jobs associera automatiquement le temps, le GPS, les médias et le contexte du travail.'],
  'Projects': ['Proyectos', 'Projets'], 'Today’s schedule': ['Horario de hoy', 'Planning du jour'],
  'No active projects': ['No hay proyectos activos', 'Aucun projet actif'], 'Active project': ['Proyecto activo', 'Projet actif'],
  'No scheduled shifts today': ['No hay turnos programados hoy', 'Aucun service prévu aujourd’hui'],
  'Scheduled shift': ['Turno programado', 'Service prévu'], 'Project': ['Proyecto', 'Projet'],
  'Start verified shift': ['Iniciar turno verificado', 'Démarrer un service vérifié'],
  'Location ready': ['Ubicación lista', 'Position disponible'], 'Locating…': ['Localizando…', 'Localisation…'],
  '{count} shifts today': ['Turnos hoy: {count}', 'Services aujourd’hui : {count}'],
  '{count} active projects': ['Proyectos activos: {count}', 'Projets actifs : {count}'],
  '{count} active': ['Activos: {count}', 'Actifs : {count}'], '{count} today': ['Hoy: {count}', 'Aujourd’hui : {count}'],
  'LUCY · WORKSPACE INTELLIGENCE': ['LUCY · INTELIGENCIA DEL ESPACIO DE TRABAJO', 'LUCY · INTELLIGENCE DE L’ESPACE DE TRAVAIL'],
  'Your next best move': ['Tu próximo paso', 'Votre prochaine action'], 'Open Lucy': ['Abrir Lucy', 'Ouvrir Lucy'],
  'CONTEXT ON': ['CONTEXTO ACTIVO', 'CONTEXTE ACTIF'],
  'Connected across your workspace': ['Conectada a tu espacio de trabajo', 'Connectée à votre espace de travail'],
  'You have {count} scheduled shifts today. I can brief you on priorities and conflicts.': ['Tienes {count} turnos programados hoy. Puedo informarte sobre prioridades y conflictos.', 'Vous avez {count} services prévus aujourd’hui. Je peux vous informer des priorités et des conflits.'],
  'I can summarize active work, find exceptions, and prepare your next actions for approval.': ['Puedo resumir el trabajo activo, detectar excepciones y preparar tus próximas acciones para aprobación.', 'Je peux résumer le travail en cours, repérer les anomalies et préparer vos prochaines actions à approuver.'],
  'Brief my day': ['Resumen de mi día', 'Résumé de ma journée'],
  'CAPTURE THE WORK': ['DOCUMENTA EL TRABAJO', 'DOCUMENTEZ LE TRAVAIL'],
  'Create trusted evidence': ['Crea pruebas fiables', 'Créez des preuves fiables'],
  'Site photo': ['Foto del sitio', 'Photo du site'], 'AI review': ['Revisión de IA', 'Analyse IA'],
  'Voice note': ['Nota de voz', 'Note vocale'], 'Audio + text': ['Audio + texto', 'Audio + texte'],
  'GPS trail': ['Ruta GPS', 'Trajet GPS'], 'Verified path': ['Ruta verificada', 'Trajet vérifié'],
  'Job files': ['Archivos del trabajo', 'Fichiers du travail'], 'Media + docs': ['Multimedia + documentos', 'Médias + documents'],
  'YOUR WORKSPACE': ['TU ESPACIO DE TRABAJO', 'VOTRE ESPACE DE TRAVAIL'],
  'Run the operation': ['Gestiona la operación', 'Gérez les opérations'],
  'Schedule': ['Horario', 'Planning'], 'Timesheet': ['Hoja de horas', 'Feuille de temps'],
  'Review time': ['Revisar horas', 'Vérifier les heures'], 'Team': ['Equipo', 'Équipe'],
  'People & pay': ['Personal y pagos', 'Personnel et paie'], 'Messages': ['Mensajes', 'Messages'],
  'Crew chat': ['Chat del equipo', 'Discussion d’équipe'], 'Support': ['Soporte', 'Assistance'],
  'Customer care': ['Atención al cliente', 'Service client'], 'ALL TOOLS': ['TODAS LAS HERRAMIENTAS', 'TOUS LES OUTILS'],
  'Everything in one place': ['Todo en un solo lugar', 'Tout au même endroit'],
  'WORK & ACTIVITY': ['TRABAJO Y ACTIVIDAD', 'TRAVAIL ET ACTIVITÉ'],
  'Your daily operation': ['Tu operación diaria', 'Vos opérations quotidiennes'],
  'Crew map': ['Mapa del equipo', 'Carte de l’équipe'], 'Tasks': ['Tareas', 'Tâches'],
  'Time off': ['Tiempo libre', 'Congés'], 'History': ['Historial', 'Historique'],
  'Project files': ['Archivos del proyecto', 'Fichiers du projet'],
  'COMPANY MANAGEMENT': ['GESTIÓN DE LA EMPRESA', 'GESTION DE L’ENTREPRISE'],
  'People, access & operations': ['Personal, acceso y operaciones', 'Personnel, accès et opérations'],
  'Crew clock': ['Fichaje del equipo', 'Pointage de l’équipe'], 'Kiosk': ['Quiosco', 'Borne'],
  'Team & roles': ['Equipo y roles', 'Équipe et rôles'], 'Company': ['Empresa', 'Entreprise'],
  'Subscription': ['Suscripción', 'Abonnement'], 'ACCOUNT & HELP': ['CUENTA Y AYUDA', 'COMPTE ET AIDE'],
  'Your account and support': ['Tu cuenta y soporte', 'Votre compte et assistance'],
  'Profile': ['Perfil', 'Profil'], 'Security': ['Seguridad', 'Sécurité'],
  'Contact': ['Contacto', 'Contact'], 'Privacy': ['Privacidad', 'Confidentialité'],
  'Terms': ['Condiciones', 'Conditions'], 'About': ['Acerca de', 'À propos'],
  'Company settings': ['Configuración de la empresa', 'Paramètres de l’entreprise'], 'Sign out': ['Cerrar sesión', 'Se déconnecter'],
  'Payroll rules': ['Reglas de nómina', 'Règles de paie'],
  'Your clock session is active. GPS availability is shown below.': ['Tu sesión está activa. La disponibilidad del GPS aparece abajo.', 'Votre session est active. La disponibilité du GPS est indiquée ci-dessous.'],
};


// Work screens: display copy only; never API values, IDs, dates or user text.
Object.assign(screenCopy, {
  "Active": [
    "Activo",
    "En cours"
  ],
  "Address": [
    "Dirección",
    "Adresse"
  ],
  "Address (optional – used for directions)": [
    "Dirección (opcional, para las indicaciones)",
    "Adresse (facultative, pour l’itinéraire)"
  ],
  "Alerts": [
    "Alertas",
    "Alertes"
  ],
  "Approval failed": [
    "Error de aprobación",
    "Échec de l’approbation"
  ],
  "Approve for payroll": [
    "Aprobar para la nómina",
    "Approuver pour la paie"
  ],
  "Approved": [
    "Aprobado",
    "Approuvé"
  ],
  "Archive": [
    "Archivar",
    "Archiver"
  ],
  "Archive Project": [
    "Archivar proyecto",
    "Archiver le projet"
  ],
  "Archive \"{name}\"?": [
    "¿Archivar \"{name}\"?",
    "Archiver « {name} » ?"
  ],
  "Archived": [
    "Archivado",
    "Archivé"
  ],
  "Attach File": [
    "Adjuntar archivo",
    "Joindre un fichier"
  ],
  "Attach file (PDF, Word, Excel)": [
    "Adjuntar archivo (PDF, Word, Excel)",
    "Joindre un fichier (PDF, Word, Excel)"
  ],
  "Attached: {name}": [
    "Adjunto: {name}",
    "Pièce jointe : {name}"
  ],
  "Attachment": [
    "Archivo adjunto",
    "Pièce jointe"
  ],
  "Attachment upload failed. Your shift has not been saved. Please retry.": [
    "No se pudo subir el archivo adjunto. El turno no se guardó. Inténtelo de nuevo.",
    "L’envoi de la pièce jointe a échoué. Le service n’a pas été enregistré. Réessayez."
  ],
  "Attachment uploaded!": [
    "¡Archivo adjunto subido!",
    "Pièce jointe envoyée !"
  ],
  "Break": [
    "Descanso",
    "Pause"
  ],
  "Break minutes": [
    "Minutos de descanso",
    "Minutes de pause"
  ],
  "Cancel": [
    "Cancelar",
    "Annuler"
  ],
  "Client Name (optional)": [
    "Nombre del cliente (opcional)",
    "Nom du client (facultatif)"
  ],
  "Clock In": [
    "Registrar entrada",
    "Pointer l’arrivée"
  ],
  "Clock Out": [
    "Registrar salida",
    "Pointer le départ"
  ],
  "Clock in ISO date/time": [
    "Entrada: fecha y hora ISO",
    "Arrivée : date et heure ISO"
  ],
  "Clock out ISO date/time": [
    "Salida: fecha y hora ISO",
    "Départ : date et heure ISO"
  ],
  "Company timezone: ": [
    "Zona horaria de la empresa: ",
    "Fuseau horaire de l’entreprise : "
  ],
  "Correct time entry": [
    "Corregir registro de tiempo",
    "Corriger le pointage"
  ],
  "Correction failed": [
    "Error de corrección",
    "Échec de la correction"
  ],
  "Could not approve the entry": [
    "No se pudo aprobar el registro",
    "Impossible d’approuver le pointage"
  ],
  "Could not create shift.": [
    "No se pudo crear el turno.",
    "Impossible de créer le service."
  ],
  "Could not load shifts": [
    "No se pudieron cargar los turnos",
    "Impossible de charger les services"
  ],
  "Could not load tasks.": [
    "No se pudieron cargar las tareas.",
    "Impossible de charger les tâches."
  ],
  "Could not update the time entry": [
    "No se pudo actualizar el registro de tiempo",
    "Impossible de modifier le pointage"
  ],
  "Could not export timesheet: ": [
    "No se pudo exportar la hoja de horas: ",
    "Impossible d’exporter la feuille de temps : "
  ],
  "Create Shift": [
    "Crear turno",
    "Créer un service"
  ],
  "Create and notify": [
    "Crear y notificar",
    "Créer et notifier"
  ],
  "Creating...": [
    "Creando...",
    "Création..."
  ],
  "Date: ": [
    "Fecha: ",
    "Date : "
  ],
  "Delete": [
    "Eliminar",
    "Supprimer"
  ],
  "Delete failed": [
    "Error al eliminar",
    "Échec de la suppression"
  ],
  "Delete shift": [
    "Eliminar turno",
    "Supprimer le service"
  ],
  "Describe the expected result…": [
    "Describa el resultado esperado…",
    "Décrivez le résultat attendu…"
  ],
  "Describe the work that needs to be completed.": [
    "Describa el trabajo que se debe completar.",
    "Décrivez le travail à effectuer."
  ],
  "Edit Project": [
    "Editar proyecto",
    "Modifier le projet"
  ],
  "Edit Shift": [
    "Editar turno",
    "Modifier le service"
  ],
  "Edit shift": [
    "Editar turno",
    "Modifier le service"
  ],
  "End (HH:MM)": [
    "Fin (HH:MM)",
    "Fin (HH:MM)"
  ],
  "Error": [
    "Error",
    "Erreur"
  ],
  "Failed to pick file": [
    "No se pudo seleccionar el archivo",
    "Impossible de sélectionner le fichier"
  ],
  "Failed to save project": [
    "No se pudo guardar el proyecto",
    "Impossible d’enregistrer le projet"
  ],
  "Failed to load entries": [
    "No se pudieron cargar los registros",
    "Impossible de charger les pointages"
  ],
  "File storage is unavailable": [
    "El almacenamiento de archivos no está disponible",
    "Le stockage des fichiers est indisponible"
  ],
  "Get Directions": [
    "Ver indicaciones",
    "Afficher l’itinéraire"
  ],
  "Go back": [
    "Volver",
    "Retour"
  ],
  "Go to Home to Clock In": [
    "Ir a Inicio para registrar entrada",
    "Aller à l’accueil pour pointer l’arrivée"
  ],
  "Loading the work board…": [
    "Cargando el tablero de trabajo…",
    "Chargement du tableau de travail…"
  ],
  "Me": [
    "Yo",
    "Moi"
  ],
  "Me (": [
    "Yo (",
    "Moi ("
  ],
  "My Schedule": [
    "Mi horario",
    "Mon horaire"
  ],
  "NEW ASSIGNMENT": [
    "NUEVA ASIGNACIÓN",
    "NOUVELLE AFFECTATION"
  ],
  "New Project": [
    "Nuevo proyecto",
    "Nouveau projet"
  ],
  "New work and completed results will appear here.": [
    "Aquí aparecerán los trabajos nuevos y los resultados completados.",
    "Les nouveaux travaux et les résultats terminés apparaîtront ici."
  ],
  "No address": [
    "Sin dirección",
    "Aucune adresse"
  ],
  "No project": [
    "Sin proyecto",
    "Aucun projet"
  ],
  "No projects found": [
    "No se encontraron proyectos",
    "Aucun projet trouvé"
  ],
  "No projects yet. Tap + to create one.": [
    "Todavía no hay proyectos. Toque + para crear uno.",
    "Aucun projet pour le moment. Touchez + pour en créer un."
  ],
  "No shifts on this day": [
    "No hay turnos este día",
    "Aucun service ce jour-là"
  ],
  "No time entries this week": [
    "No hay registros de tiempo esta semana",
    "Aucun pointage cette semaine"
  ],
  "Notes": [
    "Notas",
    "Notes"
  ],
  "Notes (optional)": [
    "Notas (opcional)",
    "Notes (facultatives)"
  ],
  "Nothing in this lane": [
    "No hay tareas en esta sección",
    "Aucune tâche dans cette catégorie"
  ],
  "OT ": [
    "HE ",
    "HS "
  ],
  "Open Attachment": [
    "Abrir archivo adjunto",
    "Ouvrir la pièce jointe"
  ],
  "Overtime": [
    "Horas extra",
    "Heures supplémentaires"
  ],
  "Please enter a shift name.": [
    "Introduzca un nombre para el turno.",
    "Saisissez un nom pour le service."
  ],
  "Please select at least one employee.": [
    "Seleccione al menos un empleado.",
    "Sélectionnez au moins un employé."
  ],
  "Please try again.": [
    "Inténtelo de nuevo.",
    "Réessayez."
  ],
  "Project": [
    "Proyecto",
    "Projet"
  ],
  "Project Name": [
    "Nombre del proyecto",
    "Nom du projet"
  ],
  "Project created": [
    "Proyecto creado",
    "Projet créé"
  ],
  "Project name is required": [
    "El nombre del proyecto es obligatorio",
    "Le nom du projet est obligatoire"
  ],
  "Project not saved": [
    "Proyecto no guardado",
    "Projet non enregistré"
  ],
  "Project removed from active work. Its historical records are preserved.": [
    "El proyecto se quitó del trabajo activo. Se conservan sus registros históricos.",
    "Le projet a été retiré des travaux en cours. Son historique est conservé."
  ],
  "Project required": [
    "Proyecto obligatorio",
    "Projet obligatoire"
  ],
  "Project updated": [
    "Proyecto actualizado",
    "Projet modifié"
  ],
  "Projects": [
    "Proyectos",
    "Projets"
  ],
  "Regular": [
    "Horas regulares",
    "Heures normales"
  ],
  "Remove this scheduled shift?": [
    "¿Eliminar este turno programado?",
    "Supprimer ce service planifié ?"
  ],
  "Replay GPS Trail": [
    "Reproducir recorrido GPS",
    "Revoir le trajet GPS"
  ],
  "Required": [
    "Obligatorio",
    "Obligatoire"
  ],
  "Required correction reason": [
    "Motivo obligatorio de la corrección",
    "Motif obligatoire de la correction"
  ],
  "Retry": [
    "Reintentar",
    "Réessayer"
  ],
  "Save": [
    "Guardar",
    "Enregistrer"
  ],
  "Save shift": [
    "Guardar turno",
    "Enregistrer le service"
  ],
  "Save audited correction": [
    "Guardar corrección con auditoría",
    "Enregistrer la correction avec traçabilité"
  ],
  "Saved": [
    "Guardado",
    "Enregistré"
  ],
  "Saving...": [
    "Guardando...",
    "Enregistrement..."
  ],
  "Saving…": [
    "Guardando…",
    "Enregistrement…"
  ],
  "Search project...": [
    "Buscar proyecto...",
    "Rechercher un projet..."
  ],
  "Select Employee": [
    "Seleccionar empleado",
    "Sélectionner un employé"
  ],
  "Select Employees": [
    "Seleccionar empleados",
    "Sélectionner des employés"
  ],
  "Employees selected: {count}": [
    "Empleados seleccionados: {count}",
    "Employés sélectionnés : {count}"
  ],
  "Select a project before saving this shift.": [
    "Seleccione un proyecto antes de guardar este turno.",
    "Sélectionnez un projet avant d’enregistrer ce service."
  ],
  "Sharing is unavailable on this device": [
    "La función de compartir no está disponible en este dispositivo",
    "Le partage est indisponible sur cet appareil"
  ],
  "Shift": [
    "Turno",
    "Service"
  ],
  "Shift Details": [
    "Detalles del turno",
    "Détails du service"
  ],
  "Shift Name": [
    "Nombre del turno",
    "Nom du service"
  ],
  "Shift has been saved.": [
    "El turno se ha guardado.",
    "Le service a été enregistré."
  ],
  "Shift was not saved. Please retry.": [
    "El turno no se guardó. Inténtelo de nuevo.",
    "Le service n’a pas été enregistré. Réessayez."
  ],
  "Shifts": [
    "Turnos",
    "Services"
  ],
  "Start (HH:MM)": [
    "Inicio (HH:MM)",
    "Début (HH:MM)"
  ],
  "Success": [
    "Éxito",
    "Succès"
  ],
  "Task details required": [
    "Se requieren los detalles de la tarea",
    "Les détails de la tâche sont obligatoires"
  ],
  "Task not created": [
    "Tarea no creada",
    "Tâche non créée"
  ],
  "Task not updated": [
    "Tarea no actualizada",
    "Tâche non modifiée"
  ],
  "Tasks unavailable": [
    "Tareas no disponibles",
    "Tâches indisponibles"
  ],
  "The correction was recorded in the audit trail and returned for approval.": [
    "La corrección quedó registrada en la auditoría y se envió de nuevo para su aprobación.",
    "La correction a été consignée dans l’historique d’audit et renvoyée pour approbation."
  ],
  "The time entry is approved for payroll.": [
    "El registro de tiempo está aprobado para la nómina.",
    "Le pointage est approuvé pour la paie."
  ],
  "Time": [
    "Hora",
    "Heure"
  ],
  "Timesheet": [
    "Hoja de horas",
    "Feuille de temps"
  ],
  "Unassigned": [
    "Sin asignar",
    "Non affecté"
  ],
  "Upload failed": [
    "Error al subir",
    "Échec de l’envoi"
  ],
  "Work Board": [
    "Tablero de trabajo",
    "Tableau de travail"
  ],
  "You are offline. Your project draft is kept on this device. Reconnect and tap Save.": [
    "Está sin conexión. El borrador del proyecto se conserva en este dispositivo. Vuelva a conectarse y toque Guardar.",
    "Vous êtes hors ligne. Le brouillon du projet est conservé sur cet appareil. Reconnectez-vous et touchez Enregistrer."
  ],
  "You may only update tasks assigned to you.": [
    "Solo puede actualizar las tareas que tiene asignadas.",
    "Vous pouvez uniquement modifier les tâches qui vous sont affectées."
  ],
  "Ready": [
    "Pendiente",
    "À faire"
  ],
  "In progress": [
    "En curso",
    "En cours"
  ],
  "Completed": [
    "Completado",
    "Terminé"
  ],
  "All {count}": [
    "Todas ({count})",
    "Toutes ({count})"
  ],
  "{count} assignment • {progress}% complete": [
    "{count} tarea • {progress}% completado",
    "{count} affectation • {progress}% terminé"
  ],
  "{count} assignments • {progress}% complete": [
    "{count} tareas • {progress}% completado",
    "{count} affectations • {progress}% terminé"
  ],
  "Tap to start work": [
    "Toque para comenzar el trabajo",
    "Touchez pour commencer le travail"
  ],
  "Tap to mark complete": [
    "Toque para marcar como completado",
    "Touchez pour marquer comme terminé"
  ],
  "Tap to reopen": [
    "Toque para reabrir",
    "Touchez pour rouvrir"
  ],
  "h": [
    "h",
    "h"
  ],
  "h OT": [
    "h HE",
    "h HS"
  ],
  "m": [
    "min",
    "min"
  ],
  "🕐 Break: ": [
    "🕐 Descanso: ",
    "🕐 Pause : "
  ],
  "Month": [
    "Mes",
    "Mois"
  ],
  "Week": [
    "Semana",
    "Semaine"
  ],
  "3 days": [
    "3 días",
    "3 jours"
  ],
  "Day": [
    "Día",
    "Jour"
  ],
  "Mon": [
    "lun.",
    "lun."
  ],
  "Tue": [
    "mar.",
    "mar."
  ],
  "Wed": [
    "mié.",
    "mer."
  ],
  "Thu": [
    "jue.",
    "jeu."
  ],
  "Fri": [
    "vie.",
    "ven."
  ],
  "Sat": [
    "sáb.",
    "sam."
  ],
  "Sun": [
    "dom.",
    "dim."
  ]
});


// Availability and cover: display copy only.
Object.assign(screenCopy, {
  "A cover request to this colleague is already pending.": [
    "Ya hay una solicitud de cobertura pendiente para este colega.",
    "Une demande de remplacement est déjà en attente pour ce collègue."
  ],
  "Accept": [
    "Aceptar",
    "Accepter"
  ],
  "Approval changes the assignment after current availability and conflict checks.": [
    "La aprobación cambia la asignación después de comprobar la disponibilidad y los conflictos actuales.",
    "L’approbation modifie l’affectation après vérification des disponibilités et des conflits actuels."
  ],
  "Approve": [
    "Aprobar",
    "Approuver"
  ],
  "Approve replacement": [
    "Aprobar reemplazo",
    "Approuver le remplacement"
  ],
  "Approve replacement?": [
    "¿Aprobar el reemplazo?",
    "Approuver le remplacement ?"
  ],
  "Ask this colleague": [
    "Solicitar a este colega",
    "Demander à ce collègue"
  ],
  "Ask {name} to cover {shift}?": [
    "¿Pedir a {name} que cubra {shift}?",
    "Demander à {name} de remplacer pour {shift} ?"
  ],
  "Availability & shift cover": [
    "Disponibilidad y reemplazos",
    "Disponibilités et remplacements"
  ],
  "Awaiting colleague": [
    "Esperando al colega",
    "En attente du collègue"
  ],
  "Awaiting manager approval": [
    "Esperando aprobación del responsable",
    "En attente de l’approbation du responsable"
  ],
  "Back": [
    "Volver",
    "Retour"
  ],
  "Cancel": [
    "Cancelar",
    "Annuler"
  ],
  "Choose an end after the start, within 366 days.": [
    "La fecha de fin debe ser posterior al inicio y estar dentro de 366 días.",
    "La fin doit suivre le début, dans un délai maximal de 366 jours."
  ],
  "Cover accepted. Manager approval is still required.": [
    "Cobertura aceptada. Aún se necesita la aprobación del responsable.",
    "Remplacement accepté. L’approbation du responsable reste nécessaire."
  ],
  "Cover request declined.": [
    "Solicitud de cobertura rechazada.",
    "Demande de remplacement refusée."
  ],
  "Cover request is unavailable.": [
    "La solicitud de cobertura no está disponible.",
    "La demande de remplacement est indisponible."
  ],
  "Cover request sent. Your assignment stays until manager approval.": [
    "Solicitud enviada. Su asignación se mantiene hasta la aprobación del responsable.",
    "Demande envoyée. Votre affectation reste inchangée jusqu’à l’approbation du responsable."
  ],
  "Cover requests": [
    "Solicitudes de cobertura",
    "Demandes de remplacement"
  ],
  "Decline": [
    "Rechazar",
    "Refuser"
  ],
  "Declined": [
    "Rechazado",
    "Refusé"
  ],
  "Enter a valid calendar date, time and timezone offset.": [
    "Introduzca una fecha, hora y diferencia horaria válidas.",
    "Saisissez une date, une heure et un décalage horaire valides."
  ],
  "Enter an ISO date/time with an explicit timezone.": [
    "Introduzca una fecha y hora ISO con una zona horaria explícita.",
    "Saisissez une date et une heure ISO avec un fuseau horaire explicite."
  ],
  "Enter dates with a timezone, for example 2026-12-01T08:00:00-07:00. Dates below use this device timezone. Changes require a connection.": [
    "Introduzca fechas con zona horaria, por ejemplo 2026-12-01T08:00:00-07:00. Las fechas de abajo usan la zona horaria de este dispositivo. Se necesita conexión para realizar cambios.",
    "Saisissez les dates avec un fuseau horaire, par exemple 2026-12-01T08:00:00-07:00. Les dates ci-dessous utilisent le fuseau de cet appareil. Une connexion est nécessaire pour effectuer des modifications."
  ],
  "From (ISO date/time with timezone)": [
    "Desde (fecha y hora ISO con zona horaria)",
    "Début (date et heure ISO avec fuseau)"
  ],
  "From {from}\nUntil {until}": [
    "Desde {from}\nHasta {until}",
    "Du {from}\nAu {until}"
  ],
  "No assigned upcoming shifts.": [
    "No tiene próximos turnos asignados.",
    "Aucun service à venir ne vous est affecté."
  ],
  "No cover requests.": [
    "No hay solicitudes de cobertura.",
    "Aucune demande de remplacement."
  ],
  "No unavailability recorded.": [
    "No hay períodos de indisponibilidad registrados.",
    "Aucune indisponibilité enregistrée."
  ],
  "Reconnect before making changes. Your form has not been submitted.": [
    "Vuelva a conectarse antes de hacer cambios. El formulario no se ha enviado.",
    "Reconnectez-vous avant d’effectuer des modifications. Le formulaire n’a pas été envoyé."
  ],
  "Refresh": [
    "Actualizar",
    "Actualiser"
  ],
  "Refresh and check the current records before retrying.": [
    "Actualice y compruebe los registros actuales antes de reintentar.",
    "Actualisez et vérifiez les données actuelles avant de réessayer."
  ],
  "Remove": [
    "Eliminar",
    "Supprimer"
  ],
  "Remove unavailability": [
    "Eliminar indisponibilidad",
    "Supprimer l’indisponibilité"
  ],
  "Remove unavailability?": [
    "¿Eliminar la indisponibilidad?",
    "Supprimer l’indisponibilité ?"
  ],
  "Replacement approved": [
    "Reemplazo aprobado",
    "Remplacement approuvé"
  ],
  "Replacement approved.": [
    "Reemplazo aprobado.",
    "Remplacement approuvé."
  ],
  "Request a replacement": [
    "Solicitar un reemplazo",
    "Demander un remplacement"
  ],
  "Request cover": [
    "Solicitar cobertura",
    "Demander un remplacement"
  ],
  "Request cover?": [
    "¿Solicitar cobertura?",
    "Demander un remplacement ?"
  ],
  "Save": [
    "Guardar",
    "Enregistrer"
  ],
  "Save unavailability": [
    "Guardar indisponibilidad",
    "Enregistrer l’indisponibilité"
  ],
  "Save unavailability?": [
    "¿Guardar la indisponibilidad?",
    "Enregistrer l’indisponibilité ?"
  ],
  "Scheduled shift": [
    "Turno programado",
    "Service planifié"
  ],
  "Shift times use company timezone: {timezone}": [
    "Los horarios usan la zona horaria de la empresa: {timezone}",
    "Les horaires utilisent le fuseau de l’entreprise : {timezone}"
  ],
  "Status unavailable": [
    "Estado no disponible",
    "Statut indisponible"
  ],
  "This unavailability is already recorded.": [
    "Esta indisponibilidad ya está registrada.",
    "Cette indisponibilité est déjà enregistrée."
  ],
  "Unavailability removed.": [
    "Indisponibilidad eliminada.",
    "Indisponibilité supprimée."
  ],
  "Unavailability saved.": [
    "Indisponibilidad guardada.",
    "Indisponibilité enregistrée."
  ],
  "Unavailable member": [
    "Miembro no disponible",
    "Membre indisponible"
  ],
  "Until (ISO date/time with timezone)": [
    "Hasta (fecha y hora ISO con zona horaria)",
    "Fin (date et heure ISO avec fuseau)"
  ],
  "When you cannot work": [
    "Cuándo no puede trabajar",
    "Vos indisponibilités"
  ],
  "Work preference action failed.": [
    "La acción de preferencias laborales falló.",
    "L’action sur les préférences de travail a échoué."
  ],
  "Work preferences are unavailable. Refresh and try again.": [
    "Las preferencias laborales no están disponibles. Actualice e inténtelo de nuevo.",
    "Les préférences de travail sont indisponibles. Actualisez et réessayez."
  ],
  "Work preferences could not be loaded.": [
    "No se pudieron cargar las preferencias laborales.",
    "Impossible de charger les préférences de travail."
  ],
  "Your colleague must accept, then a manager approves after checking availability and conflicts. Accepting alone does not change the assignment.": [
    "Su colega debe aceptar y luego un responsable aprobará tras comprobar la disponibilidad y los conflictos. La aceptación por sí sola no cambia la asignación.",
    "Votre collègue doit accepter, puis un responsable approuve après vérification des disponibilités et des conflits. L’acceptation seule ne modifie pas l’affectation."
  ],
  "Your upcoming shift": [
    "Su próximo turno",
    "Votre prochain service"
  ]
});

// Native payroll processing and external payment recording.
Object.assign(screenCopy, {
  "Payroll manager access required.": [
    "Se requiere acceso de responsable de nómina.",
    "Accès de responsable de paie requis."
  ],
  "Payroll records could not be verified. Refresh before continuing.": [
    "No se pudieron verificar los registros de nómina. Actualice antes de continuar.",
    "Impossible de vérifier les dossiers de paie. Actualisez avant de continuer."
  ],
  "Payroll could not be loaded.": [
    "No se pudo cargar la nómina.",
    "Impossible de charger la paie."
  ],
  "Payroll requires a connection. Nothing was submitted.": [
    "La nómina requiere conexión. No se envió nada.",
    "La paie nécessite une connexion. Rien n’a été envoyé."
  ],
  "Payroll action failed.": [
    "La acción de nómina falló.",
    "L’action de paie a échoué."
  ],
  "Refresh and check the current payroll before retrying.": [
    "Actualice y compruebe la nómina actual antes de reintentar.",
    "Actualisez et vérifiez la paie actuelle avant de réessayer."
  ],
  "Payroll & manual payments": [
    "Nómina y pagos manuales",
    "Paie et paiements manuels"
  ],
  "Calculate and independently review payroll, pay employees through your bank, then record your confirmation. This app does not send money or verify bank settlement.": [
    "Calcule y revise la nómina de forma independiente, pague mediante su banco y registre la confirmación. Esta aplicación no envía dinero ni verifica la liquidación bancaria.",
    "Calculez et vérifiez indépendamment la paie, payez les employés par votre banque, puis consignez votre confirmation. Cette application n’envoie pas d’argent et ne vérifie pas le règlement bancaire."
  ],
  "Company payroll rules": [
    "Reglas de nómina de la empresa",
    "Règles de paie de l’entreprise"
  ],
  "Prepare payroll draft": [
    "Preparar borrador de nómina",
    "Préparer un brouillon de paie"
  ],
  "Includes all approved, unlocked time entries in this company and period, using saved effective pay rates. Preparing a draft locks those entries. It does not approve or pay payroll.": [
    "Incluye todos los registros de horas aprobados y desbloqueados de esta empresa y período, con las tarifas vigentes guardadas. Preparar el borrador bloquea esas horas. No aprueba ni paga la nómina.",
    "Inclut toutes les heures approuvées et non verrouillées de cette entreprise et période, aux taux enregistrés en vigueur. Préparer un brouillon verrouille ces heures. Cela n’approuve ni ne paie la paie."
  ],
  "Period start (YYYY-MM-DD)": [
    "Inicio del período (AAAA-MM-DD)",
    "Début de période (AAAA-MM-JJ)"
  ],
  "Period end (YYYY-MM-DD)": [
    "Fin del período (AAAA-MM-DD)",
    "Fin de période (AAAA-MM-JJ)"
  ],
  "Prepare draft": [
    "Preparar borrador",
    "Préparer le brouillon"
  ],
  "Prepare payroll draft?": [
    "¿Preparar borrador de nómina?",
    "Préparer le brouillon de paie ?"
  ],
  "Draft prepared. Select an employee to calculate payroll.": [
    "Borrador preparado. Seleccione un empleado para calcular la nómina.",
    "Brouillon préparé. Sélectionnez un employé pour calculer la paie."
  ],
  "Period: {start} to {end}": [
    "Período: {start} a {end}",
    "Période : du {start} au {end}"
  ],
  "Payroll runs": [
    "Nóminas",
    "Cycles de paie"
  ],
  "No payroll runs.": [
    "No hay nóminas.",
    "Aucun cycle de paie."
  ],
  "Payroll details": [
    "Detalles de nómina",
    "Détails de paie"
  ],
  "Saved rule revision: {revision}": [
    "Revisión de reglas guardada: {revision}",
    "Version des règles enregistrée : {revision}"
  ],
  "Payroll notes": [
    "Notas de nómina",
    "Notes de paie"
  ],
  "Save draft notes": [
    "Guardar notas del borrador",
    "Enregistrer les notes du brouillon"
  ],
  "Draft notes saved.": [
    "Notas del borrador guardadas.",
    "Notes du brouillon enregistrées."
  ],
  "Delete draft": [
    "Eliminar borrador",
    "Supprimer le brouillon"
  ],
  "Delete payroll draft?": [
    "¿Eliminar borrador de nómina?",
    "Supprimer le brouillon de paie ?"
  ],
  "Draft deleted.": [
    "Borrador eliminado.",
    "Brouillon supprimé."
  ],
  "This deletes only the draft and unlocks its time entries.": [
    "Esto elimina solo el borrador y desbloquea sus registros de horas.",
    "Cela supprime uniquement le brouillon et déverrouille ses heures."
  ],
  "Employees": [
    "Empleados",
    "Employés"
  ],
  "Independently reviewed amount": [
    "Importe revisado de forma independiente",
    "Montant vérifié indépendamment"
  ],
  "Prior YTD contribution": [
    "Contribución previa acumulada del año",
    "Cotisation antérieure cumulée de l’année"
  ],
  "I independently checked the inputs and confirm the stated calculation scope.": [
    "He comprobado los datos de forma independiente y confirmo el alcance del cálculo indicado.",
    "J’ai vérifié indépendamment les données et je confirme la portée du calcul indiquée."
  ],
  "Confirm calculation scope": [
    "Confirmar alcance del cálculo",
    "Confirmer la portée du calcul"
  ],
  "Calculate and save for review": [
    "Calcular y guardar para revisión",
    "Calculer et enregistrer pour vérification"
  ],
  "Save payroll calculation?": [
    "¿Guardar cálculo de nómina?",
    "Enregistrer le calcul de paie ?"
  ],
  "Calculation saved for independent review.": [
    "Cálculo guardado para revisión independiente.",
    "Calcul enregistré pour vérification indépendante."
  ],
  "This replaces this draft employee calculation using saved rule revision {revision}.": [
    "Esto reemplaza el cálculo del empleado en este borrador con la revisión de reglas guardada {revision}.",
    "Cela remplace le calcul de l’employé dans ce brouillon avec la version des règles enregistrée {revision}."
  ],
  "Saved calculation": [
    "Cálculo guardado",
    "Calcul enregistré"
  ],
  "Pay date": [
    "Fecha de pago",
    "Date de paie"
  ],
  "Company review is required. A saved calculation does not establish government approval.": [
    "Se requiere revisión de la empresa. Un cálculo guardado no supone aprobación gubernamental.",
    "Une vérification par l’entreprise est requise. Un calcul enregistré ne constitue pas une approbation gouvernementale."
  ],
  "Independent payroll review reference": [
    "Referencia de revisión independiente de nómina",
    "Référence de vérification indépendante de paie"
  ],
  "I checked every employee gross, YTD and deductions independently. This records company review, not government approval.": [
    "He comprobado de forma independiente el bruto, los acumulados anuales y las deducciones de cada empleado. Esto registra la revisión de la empresa, no aprobación gubernamental.",
    "J’ai vérifié indépendamment le brut, les cumuls annuels et les retenues de chaque employé. Cela consigne la vérification de l’entreprise, pas une approbation gouvernementale."
  ],
  "Confirm independent payroll review": [
    "Confirmar revisión independiente de nómina",
    "Confirmer la vérification indépendante de paie"
  ],
  "Approve reviewed payroll": [
    "Aprobar nómina revisada",
    "Approuver la paie vérifiée"
  ],
  "Approve reviewed payroll?": [
    "¿Aprobar nómina revisada?",
    "Approuver la paie vérifiée ?"
  ],
  "Payroll reviewed. Pay through your bank before recording payments.": [
    "Nómina revisada. Pague mediante su banco antes de registrar los pagos.",
    "Paie vérifiée. Payez par votre banque avant de consigner les paiements."
  ],
  "Review reference: {reference}": [
    "Referencia de revisión: {reference}",
    "Référence de vérification : {reference}"
  ],
  "Complete the exact net payment through your bank first. The payment date must match the reviewed pay date.": [
    "Complete primero el pago neto exacto mediante su banco. La fecha debe coincidir con la fecha de pago revisada.",
    "Effectuez d’abord le paiement net exact par votre banque. La date doit correspondre à la date de paie vérifiée."
  ],
  "Actual payment date (YYYY-MM-DD)": [
    "Fecha real de pago (AAAA-MM-DD)",
    "Date réelle de paiement (AAAA-MM-JJ)"
  ],
  "Bank payment reference (no account numbers)": [
    "Referencia de pago bancario (sin números de cuenta)",
    "Référence de paiement bancaire (sans numéro de compte)"
  ],
  "I completed this exact net payment through our bank.": [
    "He completado este pago neto exacto mediante nuestro banco.",
    "J’ai effectué ce paiement net exact par notre banque."
  ],
  "Confirm external bank payment": [
    "Confirmar pago bancario externo",
    "Confirmer le paiement bancaire externe"
  ],
  "Record external payment": [
    "Registrar pago externo",
    "Consigner le paiement externe"
  ],
  "Payment date must match the reviewed pay date.": [
    "La fecha de pago debe coincidir con la fecha de pago revisada.",
    "La date de paiement doit correspondre à la date de paie vérifiée."
  ],
  "Record external payment?": [
    "¿Registrar pago externo?",
    "Consigner le paiement externe ?"
  ],
  "External payment recorded. Bank settlement was not verified.": [
    "Pago externo registrado. La liquidación bancaria no fue verificada.",
    "Paiement externe consigné. Le règlement bancaire n’a pas été vérifié."
  ],
  "Amount: {amount} {currency}. Reference: {reference}": [
    "Importe: {amount} {currency}. Referencia: {reference}",
    "Montant : {amount} {currency}. Référence : {reference}"
  ],
  "External payment recorded": [
    "Pago externo registrado",
    "Paiement externe consigné"
  ],
  "Enter a valid date (YYYY-MM-DD).": [
    "Introduzca una fecha válida (AAAA-MM-DD).",
    "Saisissez une date valide (AAAA-MM-JJ)."
  ],
  "The period end must be on or after its start.": [
    "El fin del período debe ser igual o posterior al inicio.",
    "La fin de période doit être égale ou postérieure au début."
  ],
  "Enter every required amount, including zero where appropriate.": [
    "Introduzca todos los importes requeridos, incluido cero cuando corresponda.",
    "Saisissez tous les montants requis, y compris zéro s’il y a lieu."
  ],
  "Confirm the calculation scope and provide the review reference.": [
    "Confirme el alcance del cálculo e indique la referencia de revisión.",
    "Confirmez la portée du calcul et fournissez la référence de vérification."
  ],
  "Gross wages": [
    "Salario bruto",
    "Salaire brut"
  ],
  "Taxable wages": [
    "Salario imponible",
    "Salaire imposable"
  ],
  "CPP already deducted this year": [
    "CPP ya deducido este año",
    "RPC déjà retenu cette année"
  ],
  "CPP2 already deducted this year": [
    "CPP2 ya deducido este año",
    "RPC2 déjà retenu cette année"
  ],
  "EI already deducted this year": [
    "EI ya deducido este año",
    "AE déjà retenue cette année"
  ],
  "Pensionable earnings already paid this year": [
    "Ingresos sujetos a pensión ya pagados este año",
    "Gains ouvrant droit à pension déjà versés cette année"
  ],
  "Additional income tax": [
    "Impuesto adicional sobre la renta",
    "Impôt sur le revenu supplémentaire"
  ],
  "Federal claim (blank uses rule default)": [
    "Crédito federal (en blanco usa el valor de la regla)",
    "Crédit fédéral (vide utilise la valeur de la règle)"
  ],
  "Provincial claim (blank uses rule default)": [
    "Crédito provincial (en blanco usa el valor de la regla)",
    "Crédit provincial (vide utilise la valeur de la règle)"
  ],
  "Input review reference": [
    "Referencia de revisión de datos",
    "Référence de vérification des données"
  ],
  "Draft": [
    "Borrador",
    "Brouillon"
  ],
  "Reviewed": [
    "Revisada",
    "Vérifiée"
  ],
  "External payments recorded": [
    "Pagos externos registrados",
    "Paiements externes consignés"
  ],
  "Payment recorded": [
    "Pago registrado",
    "Paiement consigné"
  ],
  "Calculated — review required": [
    "Calculado — requiere revisión",
    "Calculée — vérification requise"
  ],
  "Uncalculated": [
    "Sin calcular",
    "Non calculée"
  ],
  "Income tax": [
    "Impuesto sobre la renta",
    "Impôt sur le revenu"
  ],
  "Net pay": [
    "Salario neto",
    "Salaire net"
  ],
  "Enter independently checked local gross, taxable wages, manual deductions and YTD contributions. Country selection does not certify tax coverage.": [
    "Introduzca el bruto, el salario imponible, las deducciones manuales y las contribuciones acumuladas revisados de forma independiente. Seleccionar un país no certifica cobertura fiscal.",
    "Saisissez le brut, le salaire imposable, les retenues manuelles et les cotisations cumulées vérifiés indépendamment. Le choix du pays ne certifie pas la couverture fiscale."
  ],
  "Regular Alberta/CAD wages in 2026 only. Confirm full-year CPP eligibility and standard EI. Excludes bonuses, Quebec transfers, noncash benefits, pension/RRSP deductions and special credits. YTD excludes this payment; enter zero only when no prior pay exists.": [
    "Solo salarios regulares de Alberta/CAD en 2026. Confirme elegibilidad anual para CPP y EI estándar. Excluye bonificaciones, transferencias de Quebec, beneficios no monetarios, deducciones de pensión/RRSP y créditos especiales. Los acumulados excluyen este pago; indique cero solo si no hubo pagos previos.",
    "Salaires réguliers Alberta/CAD en 2026 uniquement. Confirmez l’admissibilité annuelle au RPC et l’AE standard. Exclut primes, transferts du Québec, avantages non monétaires, retenues de pension/REER et crédits spéciaux. Les cumuls excluent ce paiement ; saisissez zéro uniquement en l’absence de paie antérieure."
  ]
});

Object.assign(screenCopy, {
  "Confirm": [
    "Confirmar",
    "Confirmer"
  ],
  "Export reviewed pay statement": [
    "Exportar recibo de nómina revisado",
    "Exporter le bulletin de paie vérifié"
  ],
  "Pay statement sharing closed.": [
    "Se cerró la opción de compartir el recibo de nómina.",
    "Le partage du bulletin de paie est fermé."
  ],
  "Pay statement is unavailable.": [
    "El recibo de nómina no está disponible.",
    "Le bulletin de paie est indisponible."
  ],
  "Sign in again before exporting payroll.": [
    "Inicie sesión de nuevo antes de exportar la nómina.",
    "Reconnectez-vous avant d’exporter la paie."
  ],
  "The reviewed pay statement could not be downloaded.": [
    "No se pudo descargar el recibo de nómina revisado.",
    "Impossible de télécharger le bulletin de paie vérifié."
  ]
});

// Native payroll administration.
Object.assign(screenCopy, {
  "Payroll administration": [
    "Administración de nómina",
    "Administration de la paie"
  ],
  "Payroll schedule": [
    "Calendario de nómina",
    "Calendrier de paie"
  ],
  "Payroll day": [
    "Día de nómina",
    "Jour de paie"
  ],
  "Payroll time (HH:mm)": [
    "Hora de nómina (HH:mm)",
    "Heure de paie (HH:mm)"
  ],
  "Default hourly rate": [
    "Tarifa horaria predeterminada",
    "Taux horaire par défaut"
  ],
  "Overtime multiplier": [
    "Multiplicador de horas extra",
    "Multiplicateur des heures supplémentaires"
  ],
  "Legacy tax rate (%)": [
    "Tasa fiscal anterior (%)",
    "Ancien taux d’impôt (%)"
  ],
  "Exact hourly rate": [
    "Tarifa horaria exacta",
    "Taux horaire exact"
  ],
  "Percentage raise": [
    "Aumento porcentual",
    "Augmentation en pourcentage"
  ],
  "Fixed hourly raise": [
    "Aumento horario fijo",
    "Augmentation horaire fixe"
  ],
  "Percentage raise scenario": [
    "Escenario de aumento porcentual",
    "Scénario d’augmentation en pourcentage"
  ],
  "Fixed hourly raise scenario": [
    "Escenario de aumento horario fijo",
    "Scénario d’augmentation horaire fixe"
  ],
  "Additional employee count scenario": [
    "Escenario de empleados adicionales",
    "Scénario d’employés supplémentaires"
  ],
  "Company timezone: {timezone}": [
    "Zona horaria de la empresa: {timezone}",
    "Fuseau horaire de l’entreprise : {timezone}"
  ],
  "Currency not configured": [
    "Moneda no configurada",
    "Devise non configurée"
  ],
  "Company payroll settings": [
    "Configuración de nómina de la empresa",
    "Paramètres de paie de l’entreprise"
  ],
  "These are saved company settings. Saving does not activate automatic payroll or make a payment. Reviewed payroll keeps its saved calculation. The legacy tax percentage does not replace independently reviewed deduction rules.": [
    "Estos son ajustes guardados de la empresa. Guardarlos no activa nómina automática ni realiza pagos. La nómina revisada conserva su cálculo. El porcentaje fiscal anterior no reemplaza las reglas de deducción revisadas de forma independiente.",
    "Ce sont les paramètres enregistrés de l’entreprise. L’enregistrement n’active pas la paie automatique et n’effectue aucun paiement. La paie vérifiée conserve son calcul. L’ancien pourcentage d’impôt ne remplace pas les règles de retenue vérifiées indépendamment."
  ],
  "Weekly": [
    "Semanal",
    "Hebdomadaire"
  ],
  "Every two weeks": [
    "Cada dos semanas",
    "Toutes les deux semaines"
  ],
  "Monthly": [
    "Mensual",
    "Mensuel"
  ],
  "Monthly day: 1–31. Check short months when planning payroll.": [
    "Día mensual: 1–31. Revise los meses cortos al planificar la nómina.",
    "Jour du mois : 1–31. Vérifiez les mois courts lors de la planification de la paie."
  ],
  "Weekly day: 0 = Sunday through 6 = Saturday. Biweekly periods also need a company anchor date.": [
    "Día semanal: 0 = domingo a 6 = sábado. Los períodos de dos semanas también necesitan una fecha de inicio de referencia de la empresa.",
    "Jour de la semaine : 0 = dimanche à 6 = samedi. Les périodes de deux semaines nécessitent aussi une date de référence de l’entreprise."
  ],
  "Save payroll settings": [
    "Guardar configuración de nómina",
    "Enregistrer les paramètres de paie"
  ],
  "Save company payroll settings?": [
    "¿Guardar configuración de nómina de la empresa?",
    "Enregistrer les paramètres de paie de l’entreprise ?"
  ],
  "Review the schedule, rates and overtime multiplier before confirming.": [
    "Revise el calendario, las tarifas y el multiplicador de horas extra antes de confirmar.",
    "Vérifiez le calendrier, les taux et le multiplicateur des heures supplémentaires avant de confirmer."
  ],
  "Payroll settings saved.": [
    "Configuración de nómina guardada.",
    "Paramètres de paie enregistrés."
  ],
  "Employee compensation": [
    "Remuneración de empleados",
    "Rémunération des employés"
  ],
  "Effective-dated rates apply to draft preparation. Review existing draft and historical payroll separately. Saving a raise does not recalculate reviewed payroll or pay an employee.": [
    "Las tarifas con fecha de vigencia se aplican al preparar borradores. Revise por separado los borradores existentes y la nómina histórica. Guardar un aumento no recalcula la nómina revisada ni paga al empleado.",
    "Les taux datés s’appliquent à la préparation des brouillons. Vérifiez séparément les brouillons existants et les anciennes paies. Enregistrer une augmentation ne recalcule pas la paie vérifiée et ne paie pas l’employé."
  ],
  "No employees available for compensation changes.": [
    "No hay empleados disponibles para cambios de remuneración.",
    "Aucun employé disponible pour modifier la rémunération."
  ],
  "No saved rate": [
    "Sin tarifa guardada",
    "Aucun taux enregistré"
  ],
  "Rate history": [
    "Historial de tarifas",
    "Historique des taux"
  ],
  "Selected employees: {count}": [
    "Empleados seleccionados: {count}",
    "Employés sélectionnés : {count}"
  ],
  "Compensation value": [
    "Valor del cambio de remuneración",
    "Valeur du changement de rémunération"
  ],
  "Effective date (YYYY-MM-DD)": [
    "Fecha de vigencia (AAAA-MM-DD)",
    "Date d’effet (AAAA-MM-JJ)"
  ],
  "Save compensation change": [
    "Guardar cambio de remuneración",
    "Enregistrer le changement de rémunération"
  ],
  "Save compensation change?": [
    "¿Guardar cambio de remuneración?",
    "Enregistrer le changement de rémunération ?"
  ],
  "Employees: {names}. Change: {kind} {value}. Effective: {date}.": [
    "Empleados: {names}. Cambio: {kind} {value}. Vigencia: {date}.",
    "Employés : {names}. Changement : {kind} {value}. Date d’effet : {date}."
  ],
  "Compensation change saved.": [
    "Cambio de remuneración guardado.",
    "Changement de rémunération enregistré."
  ],
  "Compensation cost scenario": [
    "Escenario de costos de remuneración",
    "Scénario de coût de rémunération"
  ],
  "Read-only estimate using 40 hours per employee and current rates. Excludes deductions, overtime, benefits and employer costs. A scenario does not change rates or payroll. Future effective-dated changes are not simulated.": [
    "Estimación de solo lectura con 40 horas por empleado y tarifas actuales. Excluye deducciones, horas extra, beneficios y costos patronales. El escenario no cambia tarifas ni nómina. No simula cambios de vigencia futura.",
    "Estimation en lecture seule sur 40 heures par employé aux taux actuels. Exclut retenues, heures supplémentaires, avantages et coûts patronaux. Le scénario ne change ni les taux ni la paie. Les changements futurs datés ne sont pas simulés."
  ],
  "Scenario value": [
    "Valor del escenario",
    "Valeur du scénario"
  ],
  "Preview cost scenario": [
    "Vista previa del escenario de costos",
    "Aperçu du scénario de coût"
  ],
  "The cost scenario is unavailable.": [
    "El escenario de costos no está disponible.",
    "Le scénario de coût est indisponible."
  ],
  "Cost scenario calculated. No wages changed.": [
    "Escenario de costos calculado. No se modificaron salarios.",
    "Scénario de coût calculé. Aucun salaire modifié."
  ],
  "Current 40-hour estimate": [
    "Estimación actual de 40 horas",
    "Estimation actuelle sur 40 heures"
  ],
  "Projected 40-hour estimate": [
    "Estimación proyectada de 40 horas",
    "Estimation projetée sur 40 heures"
  ],
  "Estimated difference": [
    "Diferencia estimada",
    "Différence estimée"
  ],
  "Choose a supported payroll schedule.": [
    "Elija un calendario de nómina compatible.",
    "Choisissez un calendrier de paie pris en charge."
  ],
  "Enter a valid payroll day for this schedule.": [
    "Introduzca un día de nómina válido para este calendario.",
    "Saisissez un jour de paie valide pour ce calendrier."
  ],
  "Enter a valid payroll time (HH:mm).": [
    "Introduzca una hora de nómina válida (HH:mm).",
    "Saisissez une heure de paie valide (HH:mm)."
  ],
  "Check the rate, overtime multiplier and legacy tax percentage.": [
    "Compruebe la tarifa, el multiplicador de horas extra y el porcentaje fiscal anterior.",
    "Vérifiez le taux, le multiplicateur des heures supplémentaires et l’ancien pourcentage d’impôt."
  ],
  "Select employees from the current company list.": [
    "Seleccione empleados de la lista actual de la empresa.",
    "Sélectionnez les employés dans la liste actuelle de l’entreprise."
  ],
  "Enter a positive compensation value.": [
    "Introduzca un valor de remuneración positivo.",
    "Saisissez une valeur de rémunération positive."
  ],
  "An exact rate requires exactly one employee.": [
    "Una tarifa exacta requiere un solo empleado.",
    "Un taux exact nécessite un seul employé."
  ],
  "Choose a supported compensation change.": [
    "Elija un cambio de remuneración compatible.",
    "Choisissez un changement de rémunération pris en charge."
  ],
  "Choose a supported scenario.": [
    "Elija un escenario compatible.",
    "Choisissez un scénario pris en charge."
  ],
  "Enter a positive scenario value; hiring counts must be whole numbers.": [
    "Introduzca un valor de escenario positivo; las contrataciones deben ser números enteros.",
    "Saisissez une valeur de scénario positive ; le nombre d’embauches doit être entier."
  ]
});

Object.assign(screenCopy, {
  "My pay statements": [
    "Mis recibos de nómina",
    "Mes bulletins de paie"
  ],
  "Your pay statements could not be verified.": [
    "No se pudieron verificar sus recibos de nómina.",
    "Impossible de vérifier vos bulletins de paie."
  ],
  "Pay statements could not be loaded.": [
    "No se pudieron cargar los recibos de nómina.",
    "Impossible de charger les bulletins de paie."
  ],
  "Reconnect before downloading a pay statement.": [
    "Vuelva a conectarse antes de descargar un recibo de nómina.",
    "Reconnectez-vous avant de télécharger un bulletin de paie."
  ],
  "These statements show independently reviewed company payroll calculations. A recorded external payment is not bank-verified settlement. Contact your payroll manager about discrepancies.": [
    "Estos recibos muestran cálculos de nómina revisados de forma independiente por la empresa. Un pago externo registrado no es liquidación bancaria verificada. Consulte las discrepancias con el responsable de nómina.",
    "Ces bulletins présentent les calculs de paie vérifiés indépendamment par l’entreprise. Un paiement externe consigné ne constitue pas un règlement bancaire vérifié. Contactez votre responsable de paie en cas d’écart."
  ],
  "No reviewed pay statements are available yet.": [
    "Aún no hay recibos de nómina revisados disponibles.",
    "Aucun bulletin de paie vérifié n’est encore disponible."
  ],
  "Reviewed — external payment not recorded": [
    "Revisado — pago externo no registrado",
    "Vérifiée — paiement externe non consigné"
  ]
});

// Native year-end and read-only payout status.
Object.assign(screenCopy, {
  "Year-end records could not be verified.": [
    "No se pudieron verificar los registros de cierre anual.",
    "Impossible de vérifier les dossiers de fin d’année."
  ],
  "Year-end records could not be loaded.": [
    "No se pudieron cargar los registros de cierre anual.",
    "Impossible de charger les dossiers de fin d’année."
  ],
  "Year-end action failed.": [
    "La acción de cierre anual falló.",
    "L’action de fin d’année a échoué."
  ],
  "SIN not configured": [
    "SIN no configurado",
    "NAS non configuré"
  ],
  "Review summary only. No government filing or bank verification was performed.": [
    "Solo resumen de revisión. No se realizó presentación gubernamental ni verificación bancaria.",
    "Résumé de vérification uniquement. Aucune déclaration gouvernementale ni vérification bancaire effectuée."
  ],
  "Year-end review and archive": [
    "Revisión y archivo de cierre anual",
    "Vérification et archives de fin d’année"
  ],
  "Automatic mapping is limited to recorded, reviewed regular Alberta/CAD payments in 2026. Contractor, Quebec, worldwide and incomplete legacy records require the local filing process. Independently review every amount before storing a snapshot.": [
    "La asignación automática se limita a pagos regulares de Alberta/CAD registrados y revisados en 2026. Contratistas, Quebec, otros países y registros antiguos incompletos requieren el proceso de presentación local. Revise cada importe de forma independiente antes de guardar la instantánea.",
    "La correspondance automatique est limitée aux paiements réguliers Alberta/CAD enregistrés et vérifiés en 2026. Les entrepreneurs, le Québec, les autres pays et les anciens dossiers incomplets nécessitent la procédure locale. Vérifiez indépendamment chaque montant avant d’enregistrer l’instantané."
  ],
  "Tax year": [
    "Año fiscal",
    "Année d’imposition"
  ],
  "Employer identity": [
    "Identidad del empleador",
    "Identité de l’employeur"
  ],
  "Save employer identity": [
    "Guardar identidad del empleador",
    "Enregistrer l’identité de l’employeur"
  ],
  "Save employer identity?": [
    "¿Guardar identidad del empleador?",
    "Enregistrer l’identité de l’employeur ?"
  ],
  "Changing employer details invalidates the current preview.": [
    "Cambiar los datos del empleador invalida la vista previa actual.",
    "Modifier les coordonnées de l’employeur invalide l’aperçu actuel."
  ],
  "Employer identity saved.": [
    "Identidad del empleador guardada.",
    "Identité de l’employeur enregistrée."
  ],
  "Select employee": [
    "Seleccionar empleado",
    "Sélectionner un employé"
  ],
  "Preview year-end totals": [
    "Vista previa de totales anuales",
    "Aperçu des totaux annuels"
  ],
  "Independent year-end review reference": [
    "Referencia de revisión anual independiente",
    "Référence de vérification annuelle indépendante"
  ],
  "I independently reviewed the annual payments and every displayed form amount.": [
    "He revisado de forma independiente los pagos anuales y cada importe mostrado del formulario.",
    "J’ai vérifié indépendamment les paiements annuels et chaque montant affiché du formulaire."
  ],
  "Confirm independent year-end review": [
    "Confirmar revisión anual independiente",
    "Confirmer la vérification annuelle indépendante"
  ],
  "Store reviewed year-end snapshot": [
    "Guardar instantánea anual revisada",
    "Enregistrer l’instantané annuel vérifié"
  ],
  "Store reviewed snapshot?": [
    "¿Guardar instantánea revisada?",
    "Enregistrer l’instantané vérifié ?"
  ],
  "The server will reject changed payroll or employer totals. This stores a review record and does not file a return.": [
    "El servidor rechazará cambios en los totales de nómina o del empleador. Esto guarda un registro de revisión y no presenta una declaración.",
    "Le serveur rejettera les totaux de paie ou d’employeur modifiés. Cela conserve une vérification et ne dépose pas de déclaration."
  ],
  "Reviewed snapshot stored. No government filing was submitted.": [
    "Instantánea revisada guardada. No se presentó declaración gubernamental.",
    "Instantané vérifié enregistré. Aucune déclaration gouvernementale déposée."
  ],
  "Reviewed year-end archive": [
    "Archivo anual revisado",
    "Archives annuelles vérifiées"
  ],
  "Legacy slips without verified employer provenance are not shown. Reconcile those records separately.": [
    "No se muestran documentos antiguos sin procedencia verificada del empleador. Concilie esos registros por separado.",
    "Les anciens relevés sans provenance d’employeur vérifiée ne sont pas affichés. Rapprochez ces dossiers séparément."
  ],
  "No reviewed snapshots for this year.": [
    "No hay instantáneas revisadas para este año.",
    "Aucun instantané vérifié pour cette année."
  ],
  "Open stored snapshot": [
    "Abrir instantánea guardada",
    "Ouvrir l’instantané enregistré"
  ],
  "Awaiting approval": [
    "Pendiente de aprobación",
    "En attente d’approbation"
  ],
  "Submitting": [
    "Enviando",
    "Envoi en cours"
  ],
  "Submitted": [
    "Enviado",
    "Envoyé"
  ],
  "Processing": [
    "En procesamiento",
    "Traitement en cours"
  ],
  "Settled": [
    "Liquidado",
    "Réglé"
  ],
  "Failed": [
    "Fallido",
    "Échoué"
  ],
  "Cancelled": [
    "Cancelado",
    "Annulé"
  ],
  "Destination not configured": [
    "Destino no configurado",
    "Destination non configurée"
  ],
  "Inactive": [
    "Inactivo",
    "Inactif"
  ],
  "Unsupported country": [
    "País no compatible",
    "Pays non pris en charge"
  ],
  "Payout records could not be verified.": [
    "No se pudieron verificar los registros de desembolsos.",
    "Impossible de vérifier les dossiers de versement."
  ],
  "Payout records could not be loaded.": [
    "No se pudieron cargar los registros de desembolsos.",
    "Impossible de charger les dossiers de versement."
  ],
  "Banking and payout status": [
    "Estado bancario y de desembolsos",
    "État bancaire et des versements"
  ],
  "Direct deposit is disabled. This page only inspects saved status and history. Make bank payments separately and record them through Payroll & manual payments. No bank details are collected here.": [
    "El depósito directo está desactivado. Esta página solo consulta estados e historial guardados. Realice pagos bancarios por separado y regístrelos en Nómina y pagos manuales. Aquí no se recopilan datos bancarios.",
    "Le dépôt direct est désactivé. Cette page consulte seulement les états et l’historique enregistrés. Effectuez les paiements bancaires séparément et consignez-les dans Paie et paiements manuels. Aucune coordonnée bancaire n’est recueillie ici."
  ],
  "Saved payout configuration": [
    "Configuración de desembolsos guardada",
    "Configuration de versement enregistrée"
  ],
  "No payout configuration saved.": [
    "No hay configuración de desembolsos guardada.",
    "Aucune configuration de versement enregistrée."
  ],
  "A configured destination or historical settled status does not enable new payouts.": [
    "Un destino configurado o un estado histórico liquidado no habilita nuevos desembolsos.",
    "Une destination configurée ou un ancien état réglé n’active pas de nouveaux versements."
  ],
  "Country and currency capabilities": [
    "Capacidades por país y moneda",
    "Capacités par pays et devise"
  ],
  "Employee destination status": [
    "Estado del destino del empleado",
    "État de la destination de l’employé"
  ],
  "No destination records.": [
    "No hay registros de destinos.",
    "Aucun dossier de destination."
  ],
  "Destination configured": [
    "Destino configurado",
    "Destination configurée"
  ],
  "Saved payroll payout eligibility": [
    "Elegibilidad guardada de desembolso de nómina",
    "Admissibilité enregistrée au versement de paie"
  ],
  "No payout payroll records.": [
    "No hay registros de nómina para desembolsos.",
    "Aucun dossier de versement de paie."
  ],
  "Historical payout batches": [
    "Lotes históricos de desembolsos",
    "Lots historiques de versements"
  ],
  "No payout batches.": [
    "No hay lotes de desembolsos.",
    "Aucun lot de versements."
  ],
  "Inspect batch history": [
    "Consultar historial del lote",
    "Consulter l’historique du lot"
  ],
  "Choose a valid employee, tax year and form.": [
    "Elija un empleado, año fiscal y formulario válidos.",
    "Choisissez un employé, une année et un formulaire valides."
  ],
  "Review the preview and enter an independent review reference.": [
    "Revise la vista previa e introduzca una referencia de revisión independiente.",
    "Vérifiez l’aperçu et saisissez une référence de vérification indépendante."
  ],
  "Operating name": [
    "Nombre comercial",
    "Nom commercial"
  ],
  "Legal name": [
    "Nombre legal",
    "Dénomination légale"
  ],
  "Business number": [
    "Número de empresa",
    "Numéro d’entreprise"
  ],
  "Payroll account number": [
    "Número de cuenta de nómina",
    "Numéro de compte de retenues sur la paie"
  ],
  "City": [
    "Ciudad",
    "Ville"
  ],
  "Province": [
    "Provincia",
    "Province"
  ],
  "Postal code": [
    "Código postal",
    "Code postal"
  ],
  "Phone": [
    "Teléfono",
    "Téléphone"
  ],
  "Payroll email": [
    "Correo de nómina",
    "Courriel de paie"
  ],
  "Box 14 — Employment income": [
    "Casilla 14 — Ingresos laborales",
    "Case 14 — Revenus d’emploi"
  ],
  "Box 16 — CPP": [
    "Casilla 16 — CPP",
    "Case 16 — RPC"
  ],
  "Box 16A — CPP2": [
    "Casilla 16A — CPP2",
    "Case 16A — RPC2"
  ],
  "Box 18 — EI": [
    "Casilla 18 — EI",
    "Case 18 — AE"
  ],
  "Box 22 — Income tax": [
    "Casilla 22 — Impuesto sobre la renta",
    "Case 22 — Impôt sur le revenu"
  ],
  "Box 24 — Insurable earnings": [
    "Casilla 24 — Ingresos asegurables",
    "Case 24 — Gains assurables"
  ],
  "Box 26 — Pensionable earnings": [
    "Casilla 26 — Ingresos sujetos a pensión",
    "Case 26 — Gains ouvrant droit à pension"
  ],
  "Employer CPP and CPP2": [
    "CPP y CPP2 patronales",
    "RPC et RPC2 de l’employeur"
  ],
  "Employer EI": [
    "EI patronal",
    "AE de l’employeur"
  ]
});

Object.assign(screenCopy, {"Employee: {name}. Form: {form}. Tax year: {year}.":["Empleado: {name}. Formulario: {form}. Año fiscal: {year}.","Employé : {name}. Formulaire : {form}. Année d’imposition : {year}."]});
