import { Route, Routes } from '@angular/router';
import { Professionals } from '../enums/professionals';
import { homecareGuard } from '../guards/homecare.guard';

const guardRoute = (
  path: string,
  loadComponent: Route['loadComponent'],
  permission: string,
  types: Professionals[]
): Route => ({
  path,
  loadComponent,
  canActivate: [homecareGuard],
  data: { permission, types },
});

export const homecareRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../pages/index-page/index.page').then((m) => m.IndexPage),
  },
  guardRoute(
    'usuarios',
    () => import('../pages/users-page/users.page').then((m) => m.UsersPage),
    'usuário listar',
    [Professionals.ADMINISTRADOR]
  ),
  guardRoute(
    'regras',
    () => import('../pages/roles-page/roles.page').then((m) => m.RolesPage),
    'regra listar',
    [Professionals.ADMINISTRADOR]
  ),
  guardRoute(
    'pacientes',
    () => import('../pages/patients-page/patients.page').then((m) => m.PatientsPage),
    'paciente listar',
    [Professionals.CADASTRO]
  ),
  guardRoute(
    'arquivo-pacientes',
    () =>
      import('../pages/archive-patients-page/archive-patients.page').then(
        (m) => m.ArchivePatientsPage
      ),
    'paciente listar',
    [Professionals.CADASTRO]
  ),
  { path: '**', redirectTo: '', pathMatch: 'full' },
];