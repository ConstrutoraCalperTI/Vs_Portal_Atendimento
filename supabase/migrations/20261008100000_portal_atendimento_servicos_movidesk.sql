-- Catálogo de serviços do Movidesk (planilha "tabela de servicos.xlsx", exportada em 08/10/2026).
-- Setor TI: árvores "T.I. - Infraestrutura" e "T.I. - Sistemas" viram nível 1 (equipes Infraestrutura e Sistemas).
-- Setor CFTV: os ramos entram dentro da raiz "CFTV" que já existe.
-- Aditiva: não apaga nem desativa a carga de exemplo; só inclui o que ainda não existe (mesmo setor, pai e nome).
-- Canais: "Visível para Agente" = só agente; "Agente, Cliente" = todos. Sem SLA próprio: herda o padrão do setor.
do $$
declare
  v_ti   bigint := (select id from portal_atendimento.at_setores where lower(nome) = 'ti');
  v_cftv bigint := (select id from portal_atendimento.at_setores where lower(nome) = 'cftv');
  v_sis  bigint := (select id from portal_atendimento.at_equipes where lower(nome) = 'sistemas');
  v_inf  bigint := (select id from portal_atendimento.at_equipes where lower(nome) = 'infraestrutura');
  v_eq_cftv bigint := (select id from portal_atendimento.at_equipes where lower(nome) = 'cftv');
  r record;
  v_setor bigint;
  v_pai bigint;
  v_nome text;
  v_nivel int;
begin
  for r in select * from (values
    ('cftv', 'CFTV', null, null, '{agente,intranet,email,whatsapp}', true, 1366116),
    ('cftv', 'CFTV', 'INSTALAÇÃO', null, '{agente}', true, 1366118),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Cameras CFTV', '{agente}', true, 1393901),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Expansão de sistema existente', '{agente}', true, 1366120),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Instalação de camera para CFTV', '{agente}', true, 1366164),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Instalação de central de alarme', '{agente}', true, 1366172),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Nova obra', '{agente}', true, 1366119),
    ('cftv', 'CFTV', 'INSTALAÇÃO', 'Reinstalação (MUDANÇA DE LOCAL CAMERA)', '{agente}', true, 1366121),
    ('cftv', 'CFTV', 'MANUTENÇÃO', null, '{agente}', true, 1366160),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Captura de imagem', '{agente}', true, 1366166),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Criação de usuário', '{agente}', true, 1366169),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Eletrica', '{agente}', true, 1396200),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Monitoramento em nuvem', '{agente}', true, 1366171),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Mudança de equipamentos de rede/ switch', '{agente}', true, 1366173),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Mudança de sensor de presença', '{agente}', true, 1366174),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Mudança de servidor principal ou rack principal', '{agente}', true, 1366165),
    ('cftv', 'CFTV', 'MANUTENÇÃO', 'Rompimento de cabo de rede, fibra optica ou elétrica', '{agente}', true, 1366162),
    ('cftv', 'CFTV', 'SOLICITAÇÕES', null, '{agente}', true, 1366167),
    ('cftv', 'CFTV', 'SOLICITAÇÕES', 'Backup de gravações para entrega à fiscalização / jurídico', '{agente}', true, 1366177),
    ('cftv', 'CFTV', 'SOLICITAÇÕES', 'Orçamento de ampliação do sistema', '{agente}', true, 1366168),
    ('cftv', 'CFTV', 'SOLICITAÇÕES', 'Treinamento de equipe local', '{agente}', true, 1366176),
    ('ti', 'T.I. - Infraestrutura', null, null, '{agente,intranet,email,whatsapp}', true, 974160),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', null, '{agente,intranet,email,whatsapp}', true, 974170),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Acesso a rede (Google Drive)', '{agente,intranet,email,whatsapp}', true, 974209),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Acesso à rede WiFi', '{agente,intranet,email,whatsapp}', true, 1078156),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Acesso à sites', '{agente,intranet,email,whatsapp}', true, 1070253),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Acesso à VPN', '{agente,intranet,email,whatsapp}', true, 1036844),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Acesso/login', '{agente,intranet,email,whatsapp}', true, 974206),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Agenda/Calendário', '{agente,intranet,email,whatsapp}', true, 1102668),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Aparelho Celular', '{agente,intranet,email,whatsapp}', true, 1338304),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Carregador de Celular', '{agente,intranet,email,whatsapp}', true, 1338305),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Carregador de Notebook', '{agente,intranet,email,whatsapp}', true, 1338306),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Celular/Linha telefônica', '{agente,intranet,email,whatsapp}', true, 974212),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'E-mail', '{agente,intranet,email,whatsapp}', true, 1032115),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Impressora', '{agente,intranet,email,whatsapp}', true, 1032092),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Link de internet', '{agente,intranet,email,whatsapp}', true, 1086989),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Mapa de Vendas', '{agente,intranet,email,whatsapp}', true, 1130645),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Monitor', '{agente,intranet,email,whatsapp}', true, 974211),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'NoteBook/Desktop', '{agente,intranet,email,whatsapp}', true, 974208),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Periféricos (Fone de ouvido / headset)', '{agente,intranet,email,whatsapp}', true, 1074950),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Periféricos (Microfone)', '{agente,intranet,email,whatsapp}', true, 1127719),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Periféricos (teclado/mouse)', '{agente,intranet,email,whatsapp}', true, 1037094),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Rede (Acesso à Internet)', '{agente,intranet,email,whatsapp}', true, 1089065),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Software', '{agente,intranet,email,whatsapp}', true, 1034049),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Telefonia Fixa/GoTo', '{agente,intranet,email,whatsapp}', true, 974215),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'TVs', '{agente,intranet,email,whatsapp}', true, 974213),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Verificação de Vírus', '{agente,intranet,email,whatsapp}', true, 1042473),
    ('ti', 'T.I. - Infraestrutura', 'Incidente', 'Webcam', '{agente,intranet,email,whatsapp}', true, 974214),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', null, '{agente,intranet,email,whatsapp}', true, 974169),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Acesso à agenda/calendário', '{agente,intranet,email,whatsapp}', true, 1089105),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Acesso à pendrives', '{agente,intranet,email,whatsapp}', true, 1098304),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Acesso GoTo Connect (Telefonia Fixa)', '{agente,intranet,email,whatsapp}', true, 1053146),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Acessorios', '{agente}', true, 1369557),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Alteração de Contrato de Link de Internet', '{agente,intranet,email,whatsapp}', true, 1175815),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Aparelho Celular', '{agente,intranet,email,whatsapp}', true, 1338303),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Aquisição de novas linhas móveis (Chips/E-SIM)', '{agente,intranet,email,whatsapp}', true, 1054230),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Ativação de chamadas DDI (Telefonia móvel)', '{agente,intranet,email,whatsapp}', true, 1054321),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Backup', '{agente,intranet,email,whatsapp}', true, 1086722),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Bloqueio de credenciais de acesso de usuários', '{agente,intranet,email,whatsapp}', true, 1070503),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Cadastrar e-mail como SPAM', '{agente,intranet,email,whatsapp}', true, 1054027),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Cancelamento de link de internet', '{agente,intranet,email,whatsapp}', true, 1079590),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Carregador de Celular', '{agente,intranet,email,whatsapp}', true, 1338307),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Carregador de Notebook', '{agente,intranet,email,whatsapp}', true, 1338308),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Compra de Software', '{agente,intranet,email,whatsapp}', true, 1068029),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Configuração de perfil Outlook', '{agente,intranet,email,whatsapp}', true, 1033170),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Contratação de Link de Internet', '{agente,intranet,email,whatsapp}', true, 1175814),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de Conta de E-mail', '{agente,intranet,email,whatsapp}', true, 1073933),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de Diretório de Rede', '{agente,intranet,email,whatsapp}', true, 1054211),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de grupo de e-mail', '{agente,intranet,email,whatsapp}', true, 1089062),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de procedimentos TI', '{agente,intranet,email,whatsapp}', true, 1174775),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de Redirecionamento de E-mail', '{agente,intranet,email,whatsapp}', true, 1079084),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de Resposta Automática de E-mail', '{agente,intranet,email,whatsapp}', true, 1059141),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação de Usuário', '{agente,intranet,email,whatsapp}', true, 974194),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação e/ou alteração em salas de reunião', '{agente,intranet,email,whatsapp}', true, 1102625),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criação/Edição de inventário', '{agente,intranet,email,whatsapp}', true, 1132676),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criar Entradas de DNS', '{agente,intranet,email,whatsapp}', true, 1114548),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Criar Infraestrutura de Rede', '{agente,intranet,email,whatsapp}', true, 1081120),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Desligamento', '{agente,intranet,email,whatsapp}', true, 1347589),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Desmobilização de Obra', '{agente,intranet,email,whatsapp}', true, 1411014),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Disparo de Comunicados (TI)', '{agente,intranet,email,whatsapp}', true, 1059024),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Equipamentos', '{agente,intranet,email,whatsapp}', true, 974195),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Exclusão de credenciais', '{agente,intranet,email,whatsapp}', true, 1097060),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Fatura', '{agente,intranet,email,whatsapp}', true, 1042802),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Implantação de Infraestrutura (Cabeamentos / WiFi)', '{agente,intranet,email,whatsapp}', true, 1086601),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Instalação de impressora', '{agente,intranet,email,whatsapp}', true, 1059312),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Instalação de Software', '{agente,intranet,email,whatsapp}', true, 1033168),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Janela de Manutenção (Preventiva)', '{agente,intranet,email,whatsapp}', true, 974201),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Janela de Manutenção (Reativa)', '{agente,intranet,email,whatsapp}', true, 974200),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Liberação de acesso à sites', '{agente,intranet,email,whatsapp}', true, 1021228),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Liberação de Portas no Firewall', '{agente,intranet,email,whatsapp}', true, 1058861),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Liberação de Roaming Internacional', '{agente,intranet,email,whatsapp}', true, 1054325),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Limpeza de Diretório - Drive', '{agente,intranet,email,whatsapp}', true, 1187929),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Linha Telefonica (movel)', '{agente,intranet,email,whatsapp}', true, 974202),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Linha Telefônica (móvel)', '{agente,intranet,email,whatsapp}', true, 1075491),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Logs', '{agente,intranet,email,whatsapp}', true, 1033186),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Movimentação de Funcionários', '{agente,intranet,email,whatsapp}', true, 1461120),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Movimentação de máquina no AD', '{agente,intranet,email,whatsapp}', true, 1184466),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Mudança de layout', '{agente,intranet,email,whatsapp}', true, 974203),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Mudança de Localização do Link de Internet', '{agente,intranet,email,whatsapp}', true, 1175816),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Permissão de acesso (Diretório de rede)', '{agente,intranet,email,whatsapp}', true, 974197),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Permissão de acesso (Grupo de E-mail)', '{agente,intranet,email,whatsapp}', true, 974198),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Ponto de rede', '{agente,intranet,email,whatsapp}', true, 1048919),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Primeiros acessos (novo usuário)', '{agente,intranet,email,whatsapp}', true, 1201583),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Redefinição de Senha', '{agente,intranet,email,whatsapp}', true, 1057778),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Relatório Desktime', '{agente,intranet,email,whatsapp}', true, 1059300),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Renovação de Domínio', '{agente,intranet,email,whatsapp}', true, 1072476),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Reparo Película', '{agente,intranet,email,whatsapp}', true, 1364763),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Rescisão de Contrato', '{agente,intranet,email,whatsapp}', true, 1034456),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Restore de Backup', '{agente,intranet,email,whatsapp}', true, 974205),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Solicitação de acesso à VPN', '{agente,intranet,email,whatsapp}', true, 1036846),
    ('ti', 'T.I. - Infraestrutura', 'Solicitação', 'Troca de chip', '{agente,intranet,email,whatsapp}', true, 1095626),
    ('ti', 'T.I. - Sistemas', null, null, '{agente,intranet,email,whatsapp}', true, 974161),
    ('ti', 'T.I. - Sistemas', 'Aztronic', null, '{agente,intranet,email,whatsapp}', true, 974175),
    ('ti', 'T.I. - Sistemas', 'Aztronic', 'Erro de Integração TOTVS', '{agente,intranet,email,whatsapp}', true, 974236),
    ('ti', 'T.I. - Sistemas', 'Aztronic', 'Erro na Utilização', '{agente,intranet,email,whatsapp}', true, 974240),
    ('ti', 'T.I. - Sistemas', 'Aztronic', 'Fora de Operação', '{agente,intranet,email,whatsapp}', true, 974239),
    ('ti', 'T.I. - Sistemas', 'Aztronic', 'Sem Acesso', '{agente,intranet,email,whatsapp}', true, 974234),
    ('ti', 'T.I. - Sistemas', 'Aztronic', 'Solicitação de Acesso', '{agente,intranet,email,whatsapp}', true, 1036798),
    ('ti', 'T.I. - Sistemas', 'BigCore', null, '{agente,intranet,email,whatsapp}', true, 974173),
    ('ti', 'T.I. - Sistemas', 'BigCore', 'Erro na Utilização', '{agente,intranet,email,whatsapp}', true, 974244),
    ('ti', 'T.I. - Sistemas', 'BigCore', 'Fora de Operação', '{agente,intranet,email,whatsapp}', true, 974243),
    ('ti', 'T.I. - Sistemas', 'BigCore', 'Sem Acesso', '{agente,intranet,email,whatsapp}', true, 974242),
    ('ti', 'T.I. - Sistemas', 'Movidesk', null, '{agente,intranet,email,whatsapp}', true, 1034969),
    ('ti', 'T.I. - Sistemas', 'Movidesk', 'Demandas Financeiras', '{agente,intranet,email,whatsapp}', true, 1034972),
    ('ti', 'T.I. - Sistemas', 'Movidesk', 'Disparos em Massa', '{agente}', true, 1237084),
    ('ti', 'T.I. - Sistemas', 'Movidesk', 'Problema no Sistema', '{agente,intranet,email,whatsapp}', true, 1034970),
    ('ti', 'T.I. - Sistemas', 'Ponto Web', null, '{agente,intranet,email,whatsapp}', true, 974174),
    ('ti', 'T.I. - Sistemas', 'Ponto Web', 'Sem Acesso', '{agente,intranet,email,whatsapp}', true, 974245),
    ('ti', 'T.I. - Sistemas', 'SYNC', null, '{agente}', true, 1409129),
    ('ti', 'T.I. - Sistemas', 'SYNC', 'Acesso', '{agente}', true, 1409130),
    ('ti', 'T.I. - Sistemas', 'SYNC', 'Erros de conexão', '{agente}', true, 1409131),
    ('ti', 'T.I. - Sistemas', 'TOTVS', null, '{agente,intranet,email,whatsapp}', true, 974171),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Módulo Aprovação', '{agente,intranet,email,whatsapp}', true, 974229),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Modulo Automação de Ponto', '{agente,intranet,email,whatsapp}', true, 1049214),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Módulo de Compras', '{agente,intranet,email,whatsapp}', true, 974227),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Obras & Projetos', '{agente,intranet,email,whatsapp}', true, 974230),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Acesso ao Sistema', '{agente,intranet,email,whatsapp}', true, 974217),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Alterações por Banco', '{agente}', true, 1158317),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Arquivo de Importação Bancaria', '{agente,intranet,email,whatsapp}', true, 1125142),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Atualização de Versão', '{agente}', true, 1337379),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Chamados TOTVS', '{agente,intranet,email,whatsapp}', true, 1056518),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Criação de Coligada', '{agente,intranet,email,whatsapp}', true, 974221),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Criação de registros TOTVS', '{agente,intranet,email,whatsapp}', true, 974218),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Criação de Relatório TOTVS', '{agente,intranet,email,whatsapp}', true, 974219),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Cubo com problema', '{agente,intranet,email,whatsapp}', true, 974224),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Folha de Pagamento', '{agente,intranet,email,whatsapp}', true, 974233),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Fora de Operação', '{agente,intranet,email,whatsapp}', true, 974231),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Inclusão de Arquivo no Workflow', '{agente,intranet,email,whatsapp}', true, 1036576),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Instalação de Software', '{agente,intranet,email,whatsapp}', true, 974216),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Janela de Manutenção', '{agente,intranet,email,whatsapp}', true, 974222),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Melhorias TOTVS', '{agente,intranet,email,whatsapp}', true, 974220),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Parametrização no Modulo de Aprovação', '{agente,intranet,email,whatsapp}', true, 1041242),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Relatórios Diversos', '{agente,intranet,email,whatsapp}', true, 974223),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Sem Acesso a Portais', '{agente,intranet,email,whatsapp}', true, 1124566),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Sistema Financeiro', '{agente,intranet,email,whatsapp}', true, 974225),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Sistema Fiscal', '{agente,intranet,email,whatsapp}', true, 974226),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'Sistema PVI (PRODUÇÃO E TESTE)', '{agente,intranet,email,whatsapp}', true, 1128528),
    ('ti', 'T.I. - Sistemas', 'TOTVS', 'TCGI (Gestão de Imoveis)', '{agente,intranet,email,whatsapp}', true, 1075329)
  ) as x(setor, n1, n2, n3, canais, ativo, movidesk_id)
  loop
    v_setor := case r.setor when 'ti' then v_ti else v_cftv end;
    continue when v_setor is null;
    v_nivel := case when r.n3 is not null then 3 when r.n2 is not null then 2 else 1 end;
    v_nome := coalesce(r.n3, r.n2, r.n1);
    v_pai := null;
    if v_nivel >= 2 then
      select s.id into v_pai from portal_atendimento.ch_servicos s
       where s.setor_id = v_setor and s.pai_id is null and lower(btrim(s.nome)) = lower(r.n1);
    end if;
    if v_nivel = 3 then
      select s.id into v_pai from portal_atendimento.ch_servicos s
       where s.setor_id = v_setor and s.pai_id = v_pai and lower(btrim(s.nome)) = lower(r.n2);
    end if;
    if v_nivel >= 2 and v_pai is null then
      raise exception 'Serviço pai não encontrado para % (Movidesk %)', v_nome, r.movidesk_id;
    end if;
    continue when exists (select 1 from portal_atendimento.ch_servicos s
                           where s.setor_id = v_setor and s.pai_id is not distinct from v_pai and lower(btrim(s.nome)) = lower(v_nome));
    insert into portal_atendimento.ch_servicos (pai_id, setor_id, nivel, nome, equipe_id, urgencia_padrao_id, categoria_padrao_id, canais, ativo, ordem)
    values (v_pai, v_setor, v_nivel, v_nome,
            case when v_nivel = 1 then case r.n1 when 'T.I. - Infraestrutura' then v_inf when 'T.I. - Sistemas' then v_sis when 'CFTV' then v_eq_cftv end end,
            3, 2, r.canais::text[], r.ativo,
            coalesce((select max(s.ordem) from portal_atendimento.ch_servicos s where s.setor_id = v_setor and s.pai_id is not distinct from v_pai), 0) + 1);
  end loop;
end;
$$;
