import type { RouteObject } from "react-router-dom";
import NotFound from "../pages/NotFound";
import Home from "../pages/home/page";
import Projects from "../pages/projects/page";
import ProjectDetail from "../pages/project-detail/page";
import Studio from "../pages/studio/page";
import Contact from "../pages/contact/page";
import Process from "../pages/process/page";
import Careers from "../pages/careers/page";

const routes: RouteObject[] = [
  {
    path: "/",
    element: <Home />,
  },
  {
    path: "/projects",
    element: <Projects />,
  },
  {
    path: "/projects/:slug",
    element: <ProjectDetail />,
  },
  {
    path: "/studio",
    element: <Studio />,
  },
  {
    path: "/process",
    element: <Process />,
  },
  {
    path: "/contact",
    element: <Contact />,
  },
  {
    path: "/careers",
    element: <Careers />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

export default routes;